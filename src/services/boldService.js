import axios from "axios";
import config from "../config/env.js";
import messageHandler from "./messageHandler.js";
import whatsappService from "./whatsappService.js";

class BoldService {
    constructor() {
        this.paymentLinkToPhoneNumber = new Map(); // Mapa para almacenar la relación paymentLinkId -> phoneNumber
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
                image_url: "https://8spn764p-3000.use2.devtunnels.ms/images/diagnostico.jpg",
            };
            const response = await axios.post(config.BOLD_API_LINK_URL, paymentData, {
                headers: {
                    Authorization: `x-api-key ${config.BOLD_API_KEY}`,
                    "Content-Type": "application/json",
                },
            });

            if (response.data?.payload?.url) {
                const paymentLinkId = response.data.payload.id; // Extraer el paymentLinkId
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

    async processWebhookEvent(event) {
        try {
            console.log('Evento recibido:', JSON.stringify(event, null, 2));

            if (event.type === 'SALE_APPROVED') {
                const paymentId = event.data?.payment_id;
                const paymentLinkId = event.data?.metadata?.reference; // Extraer el paymentLinkId
                console.log(`paymentLinkId recibido: ${paymentLinkId}`);

                console.log('consultationState antes de findUser:', messageHandler.consultationState); // Agrega este log

                if (!paymentLinkId) {
                    throw new Error('No se pudo extraer el paymentLinkId del evento.');
                }

                console.log(`paymentLinkId recibido: ${paymentLinkId}`);

                const phoneNumber = this.findUserByPaymentLinkId(paymentLinkId);

                if (!phoneNumber) {
                    console.warn('⚠️ No se encontró número de teléfono vinculado a este pago.');
                    return;
                }

                console.log(`✅ Pago aprobado para ${phoneNumber}, ID: ${paymentId}`);
                console.log(`🔄 Procesando análisis para ${phoneNumber}...`);

                if (messageHandler.consultationState[phoneNumber]) {
                    messageHandler.consultationState[phoneNumber].paymentStatus = 'verified';
                }

                await messageHandler.processAnalysisAndSendResults(phoneNumber);
                await whatsappService.sendMessage(phoneNumber, '✅ Pago recibido. Se ha enviado tu análisis completo.');
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