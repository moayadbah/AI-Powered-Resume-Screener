db = db.getSiblingDB(process.env.MONGO_DATABASE);
db.createCollection("users");
db.createCollection("jobs");
db.createCollection("resumes");
db.createCollection("screenings");
