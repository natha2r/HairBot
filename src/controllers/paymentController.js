// src/controllers/paymentController.js
import boldService from '../services/boldService.js';
import whatsappService from '../services/whatsappService.js';
import messageHandler from '../services/messageHandler.js';


//Generar link de Pago
class PaymentController {
    async generatePaymentLink(to) {
        try {
            console.log("Generating payment link for:", to);
            const paymentDetails = {}; // O puedes pasar detalles específicos del pago aquí
            const paymentLink = await boldService.createPaymentLink(paymentDetails, to); // Corregido: se pasan dos argumentos
            console.log("Payment link generated:", paymentLink);
            await whatsappService.sendMessage(to, `Aquí tienes el enlace de pago: ${paymentLink}`);
            // Obtener el ID del enlace de pago de la URL
            const paymentLinkId = paymentLink.split('/').pop();
            console.log('Payment link ID:', paymentLinkId);
            messageHandler.consultationState[to] = {
                paymentStatus: 'pending',
                paymentLink: paymentLink,
                paymentLinkId: paymentLinkId,
            };
            console.log('consultationState después de asignar:', messageHandler.consultationState[to]);
        } catch (error) {
            console.error('Error generating payment link:', error);
            await whatsappService.sendMessage(to, "Ocurrió un error al generar el enlace de pago.");
        }
    }

    async handlePaymentConfirmation(req, res) {
        try {
            const status = req.query.status;
            const paymentId = req.query.payment_id;
            const to = req.query.to;

            console.log('Estado del pago:', status);
            console.log('ID del pago:', paymentId);
            console.log('Usuario:', to);

            if (!to) {
                return res.status(400).send('Falta el parámetro "to".');
            }

            if (status === 'success') {
                // Pago exitoso: actualizar el estado y enviar mensaje al usuario
                messageHandler.consultationState[to].paymentStatus = 'verified';
                await whatsappService.sendMessage(to, "¡Pago exitoso! Gracias por tu compra.");

                // Enviar el análisis completo
                await messageHandler.processAnalysisAndSendResults(to);

                res.send('¡Pago exitoso! Gracias por tu compra.');
            } else {
                // Pago fallido: enviar mensaje al usuario
                await whatsappService.sendMessage(to, "El pago falló. Por favor, inténtalo de nuevo.");
                res.send('El pago falló. Por favor, inténtalo de nuevo.');
            }
        } catch (error) {
            console.error('Error en el endpoint de confirmación de pago:', error);
            res.status(500).send('Error interno del servidor');
        }
    }
}

export default new PaymentController();