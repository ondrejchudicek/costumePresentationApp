import express from "express";
import multer from "multer";
import fs from "node:fs";
import cors from "cors";
import { randomUUID } from "node:crypto";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;
const TOTAL_FILE_LIMIT = 150;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// serve uploaded models
app.use("/models", express.static("uploads/models"));
app.use("/images", express.static("uploads/images"));
app.use("/tutorial_images", express.static("tutorial_images"));

// setup storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "partFiles") {
      cb(null, "uploads/models");
    } else if (file.fieldname === "images") {
      cb(null, "uploads/images");
    } else {
      cb(new Error("Unknown field"), null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${randomUUID()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: TOTAL_FILE_LIMIT * 1024 * 1024,
  },
});

// upload endpoint
app.post(
  "/api/newObject",
  upload.fields([{ name: "name" }, { name: "partFiles" }, { name: "images" }]),
  (req, res) => {
    const allFiles = [
      ...(req.files.partFiles || []),
      ...(req.files.images || []),
    ];

    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);

    if (totalSize > TOTAL_FILE_LIMIT * 1024 * 1024) {
      allFiles.forEach((file) => {
        fs.unlink(file.path, () => {});
      });

      return res
        .status(400)
        .json({ error: `Total file size exceeds ${TOTAL_FILE_LIMIT}MB` });
    }

    const costumeID = randomUUID();
    const partNames = Array.isArray(req.body.partNames)
      ? req.body.partNames
      : [req.body.partNames];

    const imageNames = Array.isArray(req.body.imageNames)
      ? req.body.imageNames
      : [req.body.imageNames];

    const imageFiles = req.files.images || [];

    const parts = req.files.partFiles.map((file, index) => ({
      partID: `part_${costumeID.toString()}_${index}`,
      name: partNames[index],
      path: `/models/${file.filename}`,
    }));

    const images = imageFiles.map((file, index) => ({
      imageID: `image_${costumeID.toString()}_${index}`,
      name: imageNames[index],
      path: `/images/${file.filename}`,
    }));

    const newObject = {
      costumeID: costumeID,
      name: req.body.name,
      description: req.body.description,
      parts,
      images,
    };

    const data = JSON.parse(fs.readFileSync("costumes.json"));

    data.push(newObject);

    fs.writeFileSync("costumes.json", JSON.stringify(data, null, 2));

    res.json(newObject);
  },
);

// get all models
app.get("/api/models", (req, res) => {
  const models = JSON.parse(fs.readFileSync("costumes.json"));
  res.json(models);
});

app.listen(PORT, "::", () => {
  console.log(`Server running on port ${PORT}`);
});

// handle file size error
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ error: `File size exceeds ${TOTAL_FILE_LIMIT}MB` });
  }
  next(err);
});

app.all("/{*splat}", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/index.html"));
});
