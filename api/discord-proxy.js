const axios = require('axios');
const fs = require('fs');
const formidable = require('formidable'); 
const FormData = require('form-data'); 

// *** IMPORTANT: The Discord Webhook URL MUST be retrieved SECURELY from environment variables.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MAX_DISCORD_FILES = 10;

// Helper to parse the multi-part form data sent from the client
const parseMultipartForm = (req) => {
    return new Promise((resolve, reject) => {
        const form = formidable({
            multiples: true,
            maxFiles: MAX_DISCORD_FILES,
            // Maximum file size (e.g., 8MB, standard Discord file limit)
            maxFileSize: 8 * 1024 * 1024 
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                return reject(err);
            }
            // Normalize formidable output
            const payloadJson = Array.isArray(fields.payload_json) ? fields.payload_json[0] : fields.payload_json;
            const fileArray = Object.values(files).flat(); 
            
            resolve({ payloadJson, files: fileArray });
        });
    });
};

module.exports = async (req, res) => {
    // 1. Pre-flight checks
    if (!DISCORD_WEBHOOK_URL) {
        res.status(500).json({ error: 'Server configuration error: Discord Webhook URL not set in environment.' });
        return;
    }
    
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
        return;
    }
    
    try {
        // 2. Parse incoming client request (includes files and JSON payload)
        const { payloadJson, files } = await parseMultipartForm(req);
        
        if (!payloadJson) {
            return res.status(400).json({ error: 'Missing Discord payload_json in request body.' });
        }
        
        // 3. Prepare the final FormData object for Discord
        const discordFormData = new FormData();
        discordFormData.append('payload_json', payloadJson);

        // 4. Attach files using form-data
        for (const file of files) {
            const fileBuffer = fs.readFileSync(file.filepath);
            discordFormData.append('file' + files.indexOf(file), fileBuffer, {
                filename: file.originalFilename,
                contentType: file.mimetype
            });
            
            // Clean up the temporary file created by formidable
            fs.unlinkSync(file.filepath);
        }

        // 5. Send the request securely to Discord
        const discordResponse = await axios.post(DISCORD_WEBHOOK_URL, discordFormData, {
            headers: discordFormData.getHeaders() // Important for setting the boundary
        });

        // 6. Success response back to the client
        res.status(discordResponse.status).json({ success: true, message: 'Report successfully proxied to Discord.' });

    } catch (error) {
        console.error('Proxy Error:', error.message || error);
        
        // General cleanup on error
        if (req.files) {
             Object.values(req.files).flat().forEach(file => {
                if (fs.existsSync(file.filepath)) {
                    fs.unlinkSync(file.filepath);
                }
            });
        }
        res.status(500).json({ 
            error: 'Failed to send report. Check server logs.',
            detail: error.message || 'Unknown error occurred in proxy'
        });
    }
};
             
