// src/controllers/paymentController.js
import boldService from '../services/boldService.js';
import whatsappService from '../services/whatsappService.js';
import stateManager from '../services/stateManager.js';

//Generar link de Pago
class PaymentController {
    async generatePaymentLink(to) {
        try {
            console.log("Generating payment link for:", to);
            
            // Genera los detalles de pago.
            const paymentDetails = {}; 
            
            // Llama al servicio de Bold para crear el enlace de pago.
            // La función devuelve un objeto con la URL y el ID.
            const result = await boldService.createPaymentLink(paymentDetails, to); 
            const paymentLink = result.url;
            const paymentLinkId = result.paymentLinkId;

            console.log("Payment link generated:", paymentLink);
            
            // Envía el enlace de pago al usuario.
            await whatsappService.sendMessage(to, `Aquí tienes el enlace para completar tu pago de forma segura: ${paymentLink}. Una vez confirmado, procederemos con tu diagnóstico completo 😊. Si el enlace ha vencido, escribe "Diagnóstico" para iniciar un nuevo proceso. ¡Estamos aquí para ayudarte!`);

            // 🚨 Corrección: Accede al estado a través de stateManager
            const state = stateManager.getState(to) || {};
            state.paymentStatus = 'pending';
            state.paymentLink = paymentLink;
            state.paymentLinkId = paymentLinkId;
            stateManager.setState(to, state);

            console.log('Estado de consulta actualizado:', stateManager.getState(to));

        } catch (error) {
            console.error('Error generating payment link:', error);
            await whatsappService.sendMessage(to, "Ocurrió un error al generar el enlace de pago. Por favor, inténtalo de nuevo más tarde.");
        }
    }

    // 🚨 Función de confirmación de pago eliminada por completo
    // La lógica de confirmación debe ser manejada por el webhook de Bold en boldService.js
}

export default new PaymentController();