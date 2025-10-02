require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'your_verify_token';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`;
const RECIPIENT_NUMBER = '917579777407';

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      const changes = entry.changes;
      changes.forEach(change => {
        if (change.field === 'messages') {
          const value = change.value;

          if (value.messages) {
            value.messages.forEach(message => {
              console.log('Received message:', message);
            });
          }

          if (value.statuses) {
            value.statuses.forEach(status => {
              console.log('Message status:', status);
            });
          }
        }
      });
    });

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      return res.status(500).json({ error: 'Meta credentials not configured' });
    }

    const filePath = req.file.path;
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append('file', fileStream, req.file.originalname);
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    const mediaId = uploadResponse.data.id;

    const mimeType = req.file.mimetype;
    let messageType = 'document';

    if (mimeType.startsWith('image/')) {
      messageType = 'image';
    } else if (mimeType.startsWith('video/')) {
      messageType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      messageType = 'audio';
    }

    const messagePayload = {
      messaging_product: 'whatsapp',
      to: RECIPIENT_NUMBER,
      type: messageType,
      [messageType]: {
        id: mediaId
      }
    };

    if (messageType === 'document') {
      messagePayload[messageType].filename = req.file.originalname;
    }

    const sendResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      messagePayload,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'File sent to WhatsApp successfully',
      mediaId: mediaId,
      messageId: sendResponse.data.messages[0].id
    });

  } catch (error) {
    console.error('Error uploading file:', error.response?.data || error.message);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to send file',
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
