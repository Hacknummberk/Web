const Formidable = require('formidable');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

// Vercel configuration to disable default body parsing
export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // CRITICAL: Ensure this environment variable is set in Vercel settings!
  const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  if (!DISCORD_WEBHOOK_URL) {
    console.error('Environment Variable DISCORD_WEBHOOK_URL is not set.');
    return res.status(500).json({ success: false, message: 'Server Error: Webhook URL is missing from environment variables.' });
  }

  // Initialize Formidable (Fixes "formidable is not a function" error)
  const form = new Formidable.IncomingForm();

  // Parse the incoming request (which contains text fields and files)
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable Parsing Error:', err);
      return res.status(500).json({ success: false, message: 'Failed to parse form data.' });
    }

    const formDataToDiscord = new FormData();

    // 1. Append Text Fields
    for (const key in fields) {
        formDataToDiscord.append(key, fields[key][0]);
    }

    // 2. Append File Data
    const fileKeys = Object.keys(files); 
    if (fileKeys.length > 0) {
        fileKeys.forEach((key, index) => {
             const file = files[key][0]; 
             formDataToDiscord.append(`file${index}`, fs.createReadStream(file.filepath), {
                filename: file.originalFilename || `uploaded_file_${index}`,
                contentType: file.mimetype || 'application/octet-stream',
             });
        });
    }

    // 3. Proxy the Request to Discord
    try {
      const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        body: formDataToDiscord,
        headers: formDataToDiscord.getHeaders(), 
      });

      if (discordResponse.ok) {
        return res.status(200).json({ success: true, message: 'Report sent successfully.' });
      } else {
        const errorDetails = await discordResponse.text();
        return res.status(discordResponse.status).json({ success: false, message: 'Failed to proxy request to Discord.', details: errorDetails });
      }
    } catch (fetchError) {
      return res.status(500).json({ success: false, message: 'Network error during proxy attempt.' });
    }
  });
};
