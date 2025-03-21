import whatsappService from "./whatsappService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";
import paymentController from '../controllers/paymentController.js';

class MessageHandler {
    constructor() {
        this.consultationState = {};
        this.baseUrl = 'https://8spn764p-3000.use2.devtunnels.ms/images/';
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

    async handleImageMessage(to, imageId) {
        try {
            const state = this.consultationState[to];
            if (state && state.step === "photo1") {
                state.photo1Id = imageId;
                state.step = "photo2";
                await whatsappService.sendMediaMessage(
                    to,
                    "image",
                    this.baseUrl + 'foto_espalda.jpg',
                    messages.SEGUNDA_FOTO_MESSAGE
                );
            } else if (state && state.step === "photo2") {
                state.photo2Id = imageId;
                await whatsappService.sendMessage(to, messages.ANALISIS_MESSAGE);
                await this.preliminaryAnalysis(to, state.photo1Id, state.photo2Id);
                //delete this.consultationState[to]; // Eliminar el estado luego del analisis preliminar
            } else {
                await whatsappService.sendMessage(to, messages.INSTRUCCIONES_MESSAGE);
            }
        } catch (error) {
            console.error("Error processing image:", error);
            await whatsappService.sendMessage(to, messages.ERROR_IMAGE_MESSAGE);
        }
    }

    // --- Analysis ---

    async preliminaryAnalysis(to, photo1Id, photo2Id) {
        try {
            const [photo1Path, photo2Path] = await Promise.all([
                whatsappService.downloadMedia(photo1Id),
                whatsappService.downloadMedia(photo2Id),
            ]);

            if (!photo1Path || !photo2Path) {
                throw new Error("Failed to download one or both images.");
            }

            const preliminaryResponse = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar. Realiza un análisis preliminar breve del estado del cuero cabelludo y el cabello. Indica de forma concisa si el cuero cabelludo es seco, graso o normal, y si hay signos de caspa, irritación o caída."
            );

            await whatsappService.sendMessage(to, preliminaryResponse);
            await this.offerFullAnalysis(to);
        } catch (error) {
            console.error("Error analyzing images:", error);
            await this.sendErrorMessage(to, "Ocurrió un error al analizar las imágenes.");
        }
    }

    async processAnalysisAndSendResults(to) {
        try {
            console.log("Estado consultationState: ", this.consultationState[to]);
            if (!this.consultationState[to] || this.consultationState[to].paymentStatus !== 'verified') {
                await this.sendErrorMessage(to, "El pago aún no ha sido verificado.");
                return;
            }
    
            if (!this.consultationState[to].photo1Id || !this.consultationState[to].photo2Id) {
                await whatsappService.sendMessage(to, "Faltan imágenes para el análisis. Por favor, envía ambas fotos.");
                return;
            }
    
            const [photo1Path, photo2Path] = await Promise.all([
                whatsappService.downloadMedia(this.consultationState[to].photo1Id),
                whatsappService.downloadMedia(this.consultationState[to].photo2Id),
            ]);
    
            if (!photo1Path || !photo2Path) {
                throw new Error("Failed to download images for full analysis.");
            }
    
            const fullAnalysis = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar. Realiza un análisis completo y detallado del estado del cuero cabelludo y el cabello. Incluye recomendaciones de cuidado capilar."
            );
    
            await whatsappService.sendMessage(to, fullAnalysis);
            delete this.consultationState[to]; // Limpiar el estado de la consulta (opcional)
        } catch (error) {
            console.error("Error processing and sending full analysis:", error);
            await this.sendErrorMessage(to, "Ocurrió un error al procesar y enviar el análisis completo.");
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
                    this.consultationState[to] = { step: "photo1" };
                    await whatsappService.sendMediaMessage(
                        to,
                        "image",
                        this.baseUrl + 'foto_cuero_cabelludo.jpg',
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
                    await whatsappService.sendMessage(to, "¡Gracias por contactarnos! ¡Esperamos verte pronto!");
                    break;
                case "menu":
                    await this.sendWelcomeMenu(to);
                    break;
                default:
                    await this.sendErrorMessage(to, "Lo siento, no entendí tu selección. Elige una opción válida.");
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
            addresses: [{ street: "Cra 31 #50 - 21", city: "Bucaramanga", state: "", zip: "", country: "", country_code: "", type: "WORK" }],
            emails: [{ email: "tecniclaud@gmail.com", type: "WORK" }],
            name: { formatted_name: "Profesional Claudia", first_name: "Claudia Moreno", last_name: "Moreno", middle_name: "", suffix: "", prefix: "" },
            org: { company: "Claudia Moreno", department: "Atención al Cliente", title: "Representante" },
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
        await whatsappService.sendInteractiveList(to, "Selecciona una opción:", "Menú", sections);
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
        await whatsappService.sendLocationMessage(to, latitude, longitude, name, address);
    }

    // --- Error Handling ---

    async sendErrorMessage(to, errorMessage) {
        console.error(errorMessage);
        await whatsappService.sendMessage(to, errorMessage);
    }
}

export default new MessageHandler();