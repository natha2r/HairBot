import whatsappService from "./whatsappService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";
import paymentController from "../controllers/paymentController.js";
import stateManager from "./stateManager.js";

class MessageHandler {
    constructor() {
        this.consultationState = {};
        this.baseUrl = "https://8spn764p-3000.use2.devtunnels.ms/images/";
    }

    // --- Message Handling ---

    async handleIncomingMessage(message, senderInfo) {
        try {
            console.log("Handling incoming message:", message);
            if (message?.type === "text") {
                await this.handleTextMessage(message, senderInfo);
            } else if (message?.type === "interactive") {
                await this.handleInteractiveMessage(message);
            } else if (message?.type === "image") {
                await this.handleImageMessage(message.from, message.image.id);
            }
            await whatsappService.markAsRead(message.id);
        } catch (error) {
            console.error("Error handling incoming message:", error);
        }
    }

    async handleTextMessage(message, senderInfo) {
        try {
            const incomingMessage = message.text.body.toLowerCase().trim();
            if (this.isGreeting(incomingMessage)) {
                await this.sendWelcomeSequence(message.from, senderInfo);
            } else if (this.consultationState[message.from]) {
                await this.handleConsultationFlow(message.from, incomingMessage);
            } else {
                await this.handleMenuOption(message.from, incomingMessage);
            }
        } catch (error) {
            console.error("Error handling text message:", error);
        }
    }

    async handleInteractiveMessage(message) {
        try {
            let option;
            if (message?.interactive?.button_reply) {
                option = message?.interactive?.button_reply?.id;
            } else if (message?.interactive?.list_reply) {
                option = message?.interactive?.list_reply?.id;
            }
            if (option) {
                await this.handleMenuOption(message.from, option);
            }
        } catch (error) {
            console.error("Error handling interactive message:", error);
        }
    }

    // --- Image Handling ---

    async handleImageMessage(phoneNumber, imageId) {
        console.log(`📩 Recibiendo imagen para ${phoneNumber}, ID: ${imageId}`);
        try {
            let state = stateManager.getState(phoneNumber);
            if (!state) {
                state = {
                    paymentStatus: "verified", // Asumiendo que el pago ya está verificado
                    images: [],
                    step: "photo1", // Inicializar el paso
                };
                stateManager.setState(phoneNumber, state);
            }

            if (!state.images) {
                state.images = [];
            }

            state.images.push(imageId);

            if (state.step === "photo1") {
                state.photo1Id = imageId;
                state.step = "photo2";
                console.log(
                    `📸 Primera imagen recibida para ${phoneNumber}. Avanzando a photo2.`
                );
                await whatsappService.sendMediaMessage(
                    phoneNumber,
                    "image",
                    this.baseUrl + "foto_espalda.jpg",
                    messages.SEGUNDA_FOTO_MESSAGE
                );
            } else if (state.step === "photo2") {
                state.photo2Id = imageId;
                console.log(
                    `✅ Segunda imagen recibida para ${phoneNumber}. Estado actualizado:`,
                    state
                );
                await whatsappService.sendMessage(phoneNumber, messages.ANALISIS_MESSAGE);
                // Verificar si el pago ya fue recibido
                if (state.paymentStatus === "verified") {
                    console.log(
                        `🔥 Pago ya verificado. Iniciando análisis preliminar para ${phoneNumber}...`
                    );
                    await this.preliminaryAnalysis(
                        phoneNumber,
                        state.photo1Id,
                        state.photo2Id
                    );
                } else {
                    console.log(
                        `⏳ Esperando pago para ${phoneNumber} antes de proceder con el análisis.`
                    );
                }
            }

            console.log(`📸 Estado actualizado para ${phoneNumber}:`, state);
        } catch (error) {
            console.error("❌ Error en handleImageMessage:", error);
            await whatsappService.sendMessage(
                phoneNumber,
                messages.ERROR_IMAGE_MESSAGE
            );
        }
    }

    async obtenerStatusImagen() {
        return true;
    }

    // --- Analysis ---

    // Ejemplo de reutilización de imágenes
    async preliminaryAnalysis(to, photo1Id, photo2Id) {
        try {
            console.log(
                `🔍 Descargando imágenes para análisis preliminar de ${to}...`
            );

            const [photo1Path, photo2Path] = await Promise.all([
                whatsappService.downloadMedia(photo1Id),
                whatsappService.downloadMedia(photo2Id),
            ]);

            if (!photo1Path || !photo2Path) {
                console.error("⚠️ No se pudieron descargar las imágenes.");
                return;
            }

            console.log(`📸 Imágenes descargadas: ${photo1Path}, ${photo2Path}`);

            const preliminaryResponse = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar. Realiza un análisis preliminar breve del estado del cuero cabelludo y el cabello."
            );

            console.log(
                `📨 Enviando análisis preliminar a ${to}:`,
                preliminaryResponse
            );
            await whatsappService.sendMessage(to, preliminaryResponse);

            // Ofrecer análisis completo
            await this.offerFullAnalysis(to);
        } catch (error) {
            console.error("❌ Error en preliminaryAnalysis:", error);
            await this.sendErrorMessage(
                to,
                "Ocurrió un error al analizar las imágenes."
            );
        }
    }

    // En processAnalysisAndSendResults
    async processAnalysisAndSendResults(to) {
        console.log(`🚀 Ejecutando processAnalysisAndSendResults para ${to}`);
        try {
            const state = stateManager.getState(to);

            console.log("Estado actual:", {
                paymentStatus: state.paymentStatus,
                photo1Id: state.photo1Id,
                photo2Id: state.photo2Id,
            });
            if (
                !state ||
                state.paymentStatus !== "verified" ||
                !state.photo1Id ||
                !state.photo2Id
            ) {
                await this.sendErrorMessage(
                    to,
                    "El pago o las imágenes aún no están listos."
                );
                return;
            }

            console.log("id foto 1: ", state.photo1Id);
            console.log("id foto 2: ", state.photo2Id);

            // Descargar las imágenes
            const [photo1Path, photo2Path] = await Promise.all([
                whatsappService.downloadMedia(state.photo1Id),
                whatsappService.downloadMedia(state.photo2Id),
            ]);

            if (!photo1Path || !photo2Path) {
                console.error(
                    `⚠️ Error: No se pudieron descargar las imágenes. photo1Id: ${state.photo1Id}, photo2Id: ${state.photo2Id}`
                );
                await this.sendErrorMessage(
                    to,
                    "No se pudieron descargar las imágenes para el análisis."
                );
                return;
            }

            // Realizar el análisis completo
            const fullAnalysis = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar. Realiza un análisis completo y detallado del estado del cuero cabelludo y el cabello. Incluye recomendaciones de cuidado capilar."
            );

            await whatsappService.sendMessage(to, fullAnalysis);
            stateManager.deleteState(to); // Limpiar el estado después de completar el análisis
        } catch (error) {
            console.error("Error en processAnalysisAndSendResults:", error);
            await this.sendErrorMessage(
                to,
                `Ocurrió un error al procesar el análisis completo: ${error}`
            );
        }
    }

    // --- Menu Options Handling ---

    async handleMenuOption(to, option) {
        try {
            console.log("Handling menu option:", { to, option });
            switch (option) {
                case "full_analysis_yes":
                    await paymentController.generatePaymentLink(to);
                    break;
                case "full_analysis_no":
                    await whatsappService.sendMessage(to, "¡Gracias por tu consulta!");
                    break;
                case "diagnostico":
                    // Inicializar el estado de la consulta
                    this.consultationState[to] = {
                        step: "photo1", // Paso actual del flujo
                        photo1Id: null, // ID de la primera foto
                        photo2Id: null, // ID de la segunda foto
                        paymentStatus: "pending", // Estado del pago (pending, verified)
                        paymentReceived: false, // Indica si el pago ha sido recibido
                    };
                    await whatsappService.sendMediaMessage(
                        to,
                        "image",
                        this.baseUrl + "foto_cuero_cabelludo.jpg",
                        messages.PRIMERA_FOTO_MESSAGE
                    );
                    break;
                case "cita":
                    await whatsappService.sendMessage(to, messages.AGENDA_MESSAGE);
                    await this.sendContact(to);
                    break;
                case "productos":
                    await whatsappService.sendMessage(to, messages.PRODUCTOS_MESSAGE);
                    await this.sendHelpButtons(to); // Reutilización de función
                    break;
                case "ubicacion":
                    await this.sendLocationInfo(to); // Reutilización de función
                    await whatsappService.sendMessage(to, messages.HORARIOS_MESSAGE);
                    await this.sendHelpButtons(to); // Reutilización de función
                    break;
                case "terminar":
                    await whatsappService.sendMessage(
                        to,
                        "¡Gracias por contactarnos! ¡Esperamos verte pronto!"
                    );
                    break;
                case "menu":
                    await this.sendWelcomeMenu(to);
                    break;
                default:
                    await this.sendErrorMessage(
                        to,
                        "Lo siento, no entendí tu selección. Elige una opción válida."
                    );
            }
        } catch (error) {
            console.error("Error handling menu option:", error);
        }
    }

    // --- Welcome Sequence ---

    async sendWelcomeSequence(to, senderInfo) {
        try {
            const name = this.getSenderName(senderInfo);
            await whatsappService.sendMessage(to, messages.WELCOME_MESSAGE(name));
            await this.sendWelcomeMenu(to);
        } catch (error) {
            console.error("Error sending welcome sequence:", error);
        }
    }

    // --- Consultation Flow ---

    async handleConsultationFlow(to, message) {
        try {
            delete this.consultationState[to];
            await whatsappService.sendMessage(
                to,
                "Por favor, envie la imagen como un mensaje aparte."
            );
        } catch (error) {
            console.error("Error handling consultation flow:", error);
        }
    }

    // --- Helper Functions ---

    isGreeting(message) {
        const greetings = ["hola", "hello", "hi", "buenas tardes"];
        return greetings.includes(message);
    }

    getSenderName(senderInfo) {
        return senderInfo.profile?.name || senderInfo.wa_id;
    }

    async sendContact(to) {
        const contact = {
            addresses: [
                {
                    street: "Cra 31 #50 - 21",
                    city: "Bucaramanga",
                    state: "",
                    zip: "",
                    country: "",
                    country_code: "",
                    type: "WORK",
                },
            ],
            emails: [{ email: "tecniclaud@gmail.com", type: "WORK" }],
            name: {
                formatted_name: "Profesional Claudia",
                first_name: "Claudia Moreno",
                last_name: "Moreno",
                middle_name: "",
                suffix: "",
                prefix: "",
            },
            org: {
                company: "Claudia Moreno",
                department: "Atención al Cliente",
                title: "Representante",
            },
            phones: [{ phone: "+573224457046", wa_id: "573224457046", type: "WORK" }],
            urls: [{ url: "https://claudiamoreno.webnode.com.co", type: "WORK" }],
        };
        await whatsappService.sendContactMessage(to, contact);
    }

    async sendWelcomeMenu(to) {
        const sections = [
            {
                title: "Opciones Principales",
                rows: [
                    { id: "diagnostico", title: "Diagnóstico Capilar" },
                    { id: "cita", title: "Cita con Profesional" },
                    { id: "productos", title: "Ver Productos" },
                    { id: "ubicacion", title: "Ubicación" },
                ],
            },
        ];
        await whatsappService.sendInteractiveList(
            to,
            "Selecciona una opción:",
            "Menú",
            sections
        );
    }

    async offerFullAnalysis(to) {
        const message = "¿Deseas un análisis completo y detallado? Costo: $50.000";
        const buttons = [
            { type: "reply", reply: { id: "full_analysis_yes", title: "Sí" } },
            { type: "reply", reply: { id: "full_analysis_no", title: "No" } },
        ];
        await whatsappService.sendInteractiveButtons(to, message, buttons);
    }

    async sendHelpButtons(to) {
        await whatsappService.sendInteractiveButtons(
            to,
            "¿Necesitas ayuda adicional?",
            [
                { type: "reply", reply: { id: "terminar", title: "No, gracias" } },
                { type: "reply", reply: { id: "menu", title: "Menú principal" } },
            ]
        );
    }

    async sendLocationInfo(to) {
        const latitude = 7.114296;
        const longitude = -73.112385;
        const name = "Alpelo Peluquería";
        const address = "📌 Cra. 31 #50 - 21, Sotomayor, Bucaramanga, Santander";
        await whatsappService.sendLocationMessage(
            to,
            latitude,
            longitude,
            name,
            address
        );
    }

    // --- Error Handling ---

    async sendErrorMessage(to, errorMessage) {
        console.error(errorMessage);
        await whatsappService.sendMessage(to, errorMessage);
    }
}

export default new MessageHandler();
