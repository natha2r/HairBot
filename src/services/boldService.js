import axios from "axios";
import config from "../config/env.js";
import messageHandler from "./messageHandler.js";
import whatsappService from "./whatsappService.js";
import stateManager from './stateManager.js';

class BoldService {
    constructor() {
        this.paymentLinkToPhoneNumber = new Map();
    }

    async createPaymentLink(paymentDetails, phoneNumber) {
        try {
            const { orderId, amount, currency, expiration_date } = paymentDetails;
            const paymentData = {
                amount_type: "CLOSE",
                amount: {
                    currency: currency || "COP",
                    tip_amount: 0,
                    total_amount: amount || 49900,
                },
                description: orderId || "Diagnóstico Capilar",
                expiration_date: expiration_date || (Date.now() * 1e6) + (10 * 60 * 1e9),
                image_url: `${config.DOMINIO_URL}/images/diagnostico.jpg`,
            };
            const response = await axios.post(config.BOLD_API_LINK_URL, paymentData, {
                headers: {
                    Authorization: `x-api-key ${config.BOLD_API_KEY}`,
                    "Content-Type": "application/json",
                },
            });

            if (response.data?.payload?.url) {
                const paymentLinkId = response.data.payload.id; 
                if (phoneNumber) {
                    this.paymentLinkToPhoneNumber.set(paymentLinkId, phoneNumber); // Guardar en el mapa
                    messageHandler.consultationState[phoneNumber] = {
                        paymentLinkId,
                        paymentStatus: 'pending',
                    };
                    console.log(`✅ Enlace de pago creado para ${phoneNumber}:`, {
                        paymentLinkId,
                        consultationState: messageHandler.consultationState[phoneNumber]
                    });
                } else {
                    console.warn('⚠️ Número de teléfono no válido.');
                }
                return response.data.payload.url;
            } else {
                throw new Error("No se pudo generar el enlace de pago.");
            }
        } catch (error) {
            console.error("Error creating Bold payment link:", error.response?.data || error.message);
            throw new Error("Error al generar el enlace de pago.");
        }
    }

    // En processWebhookEvent
    async processWebhookEvent(event) {
        try {
            console.log('Evento recibido:', JSON.stringify(event, null, 2));
    
            const { type, data } = event;
    
            switch (type) {
                case 'SALE_APPROVED': {
                    const paymentId = data?.payment_id;
                    const paymentLinkId = data?.metadata?.reference;
    
                    if (!paymentLinkId) {
                        throw new Error('No se pudo extraer el paymentLinkId del evento.');
                    }
    
                    const phoneNumber = this.findUserByPaymentLinkId(paymentLinkId);
    
                    if (!phoneNumber) {
                        console.warn('⚠️ No se encontró número de teléfono vinculado a este pago.');
                        return;
                    }
    
                    console.log(`✅ Pago aprobado para ${phoneNumber}, ID: ${paymentId}`);
    
                    const state = stateManager.getState(phoneNumber);
                    if (state) {
                        state.paymentStatus = 'verified'; // Marcar el pago como verificado
    
                        await whatsappService.sendMessage(
                            phoneNumber,
                            '✅ ¡Pago recibido, hermosa! 💖 Estamos procesando tu análisis con mucho cuidado. En breve recibirás tu informe completo. ✨💕'
                        );
    
                        // Verificar si las imágenes ya están listas
                        if (state.photo1Id && state.photo2Id) {
                            await messageHandler.processAnalysisAndSendResults(phoneNumber);
                        } else {
                            console.log(`⏳ Esperando imágenes para ${phoneNumber} antes de procesar el análisis.`);
                        }
                    }
                    break;
                }
    
                case 'SALE_PENDING': {
                    const phoneNumber = this.findUserByPaymentLinkId(data?.metadata?.reference);
                    if (phoneNumber) {
                        console.log(`⏳ Pago pendiente para ${phoneNumber}`);
                        await whatsappService.sendMessage(
                            phoneNumber,
                            '⏳ Tu pago está en proceso. Te avisaremos cuando se confirme. ¡Gracias por tu paciencia! 😊'
                        );
                    }
                    break;
                }
    
                case 'SALE_REJECTED': {
                    const paymentLinkId = data?.metadata?.reference;
    
                    if (!paymentLinkId) {
                        console.warn('⚠️ No se pudo extraer el paymentLinkId del evento de rechazo.');
                        return;
                    }
    
                    const phoneNumber = this.findUserByPaymentLinkId(paymentLinkId);
                    if (!phoneNumber) {
                        console.warn('⚠️ No se encontró número de teléfono vinculado a este pago rechazado.');
                        return;
                    }
    
                    console.warn(`❌ Pago rechazado para ${phoneNumber}, ID: ${data.payment_id}`);
    
                    await whatsappService.sendMessage(
                        phoneNumber,
                        '❌ Tu pago no fue aprobado. Te sugerimos intentar nuevamente o usar otro método de pago. Escribe "Hola" para volver al menu inicial o "Diagnóstico" para intentar de nuevo.'
                    );
                    break;
                }
    
                default:
                    console.warn(`⚠️ Evento no manejado: ${type}`);
                    break;
            }
        } catch (error) {
            console.error('❌ Error en processWebhookEvent:', error);
        }
    }
    

    findUserByPaymentLinkId(paymentLinkId) {
        console.log(`🔎 Buscando phoneNumber para paymentLinkId: ${paymentLinkId}`);
        console.log('📋 Estado actual de consultationState:', messageHandler.consultationState);

        for (const phoneNumber in messageHandler.consultationState) {
            console.log(`🔍 Verificando phoneNumber: ${phoneNumber}`);
            if (messageHandler.consultationState[phoneNumber] && messageHandler.consultationState[phoneNumber].paymentLinkId === paymentLinkId && phoneNumber !== 'undefined') {
                console.log(`✅ phoneNumber encontrado: ${phoneNumber}`);
                return phoneNumber;
            }
        }
        console.log('❌ phoneNumber no encontrado.');
        return null;
    }
}

export default new BoldService();