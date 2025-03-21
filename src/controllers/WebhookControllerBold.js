// src/controllers/webhookControllerBold.js
import boldService from '../services/boldService.js';

class WebhookControllerBold {
    async handleBoldWebhook(req, res) {
        try {
            const event = req.body;
            await boldService.processWebhookEvent(event);
            res.status(200).send('Webhook received');
        } catch (error) {
            console.error('Error handling Bold webhook:', error);
            res.status(500).send('Webhook error');
        }
    }
}

export default new WebhookControllerBold();