const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { google } = require("googleapis");
const { config } = require("../config");

const uploadsDir = path.resolve(process.cwd(), "backend", "uploads");

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
};

const parseBase64Image = (input) => {
  const raw = String(input || "");
  const match = raw.match(/^data:(.+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64")
    };
  }
  return {
    mimeType: "image/jpeg",
    buffer: Buffer.from(raw, "base64")
  };
};

const isDriveConfigured = () =>
  Boolean(
    config.drive.clientId &&
      config.drive.clientSecret &&
      config.drive.refreshToken &&
      config.drive.folderId
  );

const uploadToDrive = async ({ base64Image, fileName }) => {
  const { mimeType, buffer } = parseBase64Image(base64Image);
  const oauth2Client = new google.auth.OAuth2(
    config.drive.clientId,
    config.drive.clientSecret,
    config.drive.redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: config.drive.refreshToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [config.drive.folderId]
    },
    media: {
      mimeType,
      body: Readable.from(buffer)
    },
    fields: "id, webViewLink, webContentLink"
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao obter id do arquivo no Drive.");

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" }
  });

  return {
    provider: "google-drive",
    fileId,
    url: `https://drive.google.com/uc?id=${fileId}`
  };
};

const uploadToLocal = async ({ base64Image, fileName }) => {
  ensureUploadsDir();
  const { buffer } = parseBase64Image(base64Image);
  const localPath = path.join(uploadsDir, fileName);
  fs.writeFileSync(localPath, buffer);
  return {
    provider: "local",
    fileId: fileName,
    url: `/uploads/${fileName}`
  };
};

const uploadPunchPhoto = async ({ base64Image, cpf, recordType, recordDate }) => {
  const fileName = `${cpf}_${recordDate}_${recordType}_${Date.now()}.jpg`;
  if (isDriveConfigured()) {
    try {
      return await uploadToDrive({ base64Image, fileName });
    } catch (error) {
      return uploadToLocal({ base64Image, fileName });
    }
  }
  return uploadToLocal({ base64Image, fileName });
};

module.exports = {
  uploadPunchPhoto
};
