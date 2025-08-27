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
            await whatsappService.sendMessage(to, `Aquí tienes el enlace para completar tu pago de forma segura: ${paymentLink}. Una vez confirmado, procederemos con tu diagnóstico completo 😊. Si el enlace ha vencido, escribe "Diagnóstico" para iniciar un nuevo proceso. ¡Estamos aquí para ayudarte!`);
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

    // Endpoint para manejar la confirmación del pago VERSIÓN ANTIGUA

    // async handlePaymentConfirmation(req, res) {
    //     try {
    //         const status = req.query.status;
    //         const paymentId = req.query.payment_id;
    //         const to = req.query.to;

    //         console.log('Estado del pago:', status);
    //         console.log('ID del pago:', paymentId);
    //         console.log('Usuario:', to);

    //         if (!to) {
    //             return res.status(400).send('Falta el parámetro "to".');
    //         }

    //         if (status === 'success') {
    //             // Pago exitoso: actualizar el estado y enviar mensaje al usuario
    //             messageHandler.consultationState[to].paymentStatus = 'verified';
    //             await whatsappService.sendMessage(to, "¡Pago exitoso! Gracias por tu compra.");

    //             // Enviar el análisis completo
    //             await messageHandler.processAnalysisAndSendResults(to);

    //             res.send('¡Pago exitoso! Gracias por tu compra.');
    //         } else {
    //             // Pago fallido: enviar mensaje al usuario
    //             await whatsappService.sendMessage(to, "El pago falló. Por favor, inténtalo de nuevo.");
    //             res.send('El pago falló. Por favor, inténtalo de nuevo.');
    //         }
    //     } catch (error) {
    //         console.error('Error en el endpoint de confirmación de pago:', error);
    //         res.status(500).send('Error interno del servidor');
    //     }
    // }

        // Endpoint para manejar la confirmación del pago VERSIÓN MEJORADA
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
            // Obtener estado actual del usuario
            const state = messageHandler.getState
                ? messageHandler.getState(to) // por si está implementado así
                : messageHandler.stateManager.getState(to); // fallback

            const currentState = state || {
                paymentStatus: 'pending',
                timestamp: Date.now(),
            };

            currentState.paymentStatus = 'verified';
            currentState.timestamp = currentState.timestamp || Date.now(); // si no existe aún

            // Guardar estado actualizado
            if (messageHandler.stateManager?.setState) {
                messageHandler.stateManager.setState(to, currentState);
            }

            // Validar si estamos dentro de la ventana de 24 horas
            if (isWithin24h(currentState.timestamp)) {
                console.log(`✅ Pago dentro de 24h. Enviando análisis a ${to}`);
                await whatsappService.sendMessage(to, "¡Pago exitoso! Gracias por tu compra.");
                await messageHandler.processAnalysisAndSendResults(to);
            } else {
                console.log(`⏳ Pago fuera de 24h. Enviando plantilla a ${to}`);
                await whatsappService.sendTemplateMessage(to, 'payment_analysis_ready', {
                    body_parameters: [], // ajusta según tu plantilla
                });
            }

            return res.send('Pago confirmado correctamente.');
        } else {
            await whatsappService.sendMessage(to, "El pago falló. Por favor, inténtalo de nuevo.");
            return res.send('El pago falló.');
        }
    } catch (error) {
        console.error('❌ Error en el endpoint de confirmación de pago:', error);
        return res.status(500).send('Error interno del servidor');
    }
}

}

export default new PaymentController();