#!/usr/bin/env sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"${PYTHON_BIN:-python3}" - "$ROOT_DIR" "${API_BASE_URL:-http://localhost:8080}" <<'PY'
import json, pathlib, sys, urllib.error, urllib.request, uuid
root, base = pathlib.Path(sys.argv[1]), sys.argv[2].rstrip("/")

def call(method, path, body=None, token=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 409 and path == "/api/auth/register": return None
        raise RuntimeError(error.read().decode()) from error

call("POST", "/api/auth/register", {"email":"demo@example.com","password":"demopassword","fullName":"Demo Recruiter"})
token = call("POST", "/api/auth/login", {"email":"demo@example.com","password":"demopassword"})["token"]
jobs = [item for item in call("GET", "/api/jobs?size=100", token=token)["content"] if item["title"].startswith("Backend Engineer")]
details = [call("GET", f"/api/jobs/{item['id']}", token=token) for item in jobs]
job = max(details, key=lambda item: item["resumeCount"], default=None)
if job is None:
    job = call("POST", "/api/jobs", json.loads((root/"docs/fixtures/jobs/backend-engineer.json").read_text()), token)
job_id = job["id"]
detail = job

def make_pdf(text):
    lines = text.splitlines()[:52]
    esc = lambda s: s.replace('\\','\\\\').replace('(','\\(').replace(')','\\)').encode('latin-1','replace').decode('latin-1')
    stream = "BT /F1 10 Tf 40 800 Td 14 TL " + " ".join(f"({esc(line[:110])}) Tj T*" for line in lines) + " ET"
    objects = ["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream"]
    data=bytearray(b"%PDF-1.4\n"); offsets=[]
    for index,obj in enumerate(objects,1): offsets.append(len(data));data.extend(f"{index} 0 obj\n{obj}\nendobj\n".encode('latin-1'))
    xref=len(data);data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets:data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode());return bytes(data)

if detail["resumeCount"] == 0:
    boundary = "----seed-" + uuid.uuid4().hex
    parts=[]
    for source in sorted((root/"docs/fixtures/resumes").glob("*.txt")):
        parts.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{source.stem}.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode(),make_pdf(source.read_text(encoding="utf-8")),b"\r\n"])
    parts.append(f"--{boundary}--\r\n".encode())
    call("POST",f"/api/jobs/{job_id}/resumes",b"".join(parts),token,f"multipart/form-data; boundary={boundary}")

call("POST",f"/api/jobs/{job_id}/screen",b"",token)
print(json.dumps(call("GET",f"/api/jobs/{job_id}/candidates?sort=score&order=desc&size=100",token=token),indent=2))
PY
