const multer = require("multer");
const Registration = require("../models/Registration");

const upload = multer({ dest: "uploads/" });

router.post("/:id", upload.single("screenshot"), async (req, res) => {
  const reg = await Registration.findById(req.params.id);

  if (!reg) return res.status(404).json({ message: "Not found" });

  if (new Date() > reg.screenshotDeadline) {
    return res.status(400).json({ message: "Upload window closed" });
  }

  reg.screenshot = req.file.path;
  await reg.save();

  res.json({ success: true });
});
