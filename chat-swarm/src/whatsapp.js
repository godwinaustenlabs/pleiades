/**
 * WhatsApp API Utility Module
 * Handles sending messages via the Meta Graph API.
 */
export async function sendWhatsAppMessage(contactID, message, env) {
    console.log('Sending WhatsApp message to', contactID, ':', message);

    // Ensure credentials are available
    if (!env.WA_PHONE_NUMBER_ID || !env.WA_ACCESS_TOKEN) {
        console.error('Missing WhatsApp API configuration (check wrangler.jsonc)');
        return;
    }

    const response = await fetch(
        `https://graph.facebook.com/v22.0/${env.WA_PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.WA_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: contactID,
                text: { body: message },
            }),
        }
    );

    // Handle API errors gracefully
    if (!response.ok) {
        const errorData = await response.json();
        console.error('WhatsApp API error:', errorData);
        throw new Error(`WhatsApp API error: ${response.statusText}`);
    }

    return await response.json();
}

