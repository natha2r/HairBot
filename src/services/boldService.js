import axios from "axios";
import config from "../config/env.js";
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
                    total_amount: amount || 5000,
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
                    this.paymentLinkToPhoneNumber.set(paymentLinkId, phoneNumber);
                    console.log(`✅ Enlace de pago creado para ${phoneNumber}:`, { paymentLinkId });
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
            const { type, data } = event;
            const paymentLinkId = data?.metadata?.reference;

            if (!paymentLinkId) {
                console.warn('⚠️ No se pudo extraer el paymentLinkId del evento.');
                return;
            }

            const phoneNumber = this.paymentLinkToPhoneNumber.get(paymentLinkId);

            if (!phoneNumber) {
                console.warn(`⚠️ No se encontró número de teléfono vinculado al paymentLinkId: ${paymentLinkId}`);
                return;
            }

            const state = stateManager.getState(phoneNumber);
            if (!state) {
                console.warn(`⚠️ No se encontró estado para el número de teléfono: ${phoneNumber}`);
                return;
            }

            switch (type) {
                case 'SALE_APPROVED': {
                    console.log(`✅ Pago aprobado para ${phoneNumber}, ID: ${data?.payment_id}`);
                    state.paymentStatus = 'verified';
                    stateManager.setState(phoneNumber, state);
                    break;
                }
                case 'SALE_PENDING': {
                    console.log(`⏳ Pago pendiente para ${phoneNumber}`);
                    state.paymentStatus = 'pending';
                    stateManager.setState(phoneNumber, state);
                    break;
                }
                case 'SALE_REJECTED': {
                    console.warn(`❌ Pago rechazado para ${phoneNumber}, ID: ${data?.payment_id}`);
                    state.paymentStatus = 'rejected';
                    stateManager.setState(phoneNumber, state);
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
}

export default new BoldService();