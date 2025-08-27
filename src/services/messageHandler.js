import whatsappService from "./whatsappService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";
import paymentController from "../controllers/paymentController.js";
import stateManager from "./stateManager.js";
import { prompts } from "./prompts.js";
import fs from "fs";
import cron from "node-cron";
import config from "../config/env.js";

// Nueva función asigandada para verificar si el timestamp está dentro de las últimas 24 horas
function isWithin24h(timestamp) {
    return Date.now() - timestamp < 24 * 60 * 60 * 1000;
}


class MessageHandler {
    constructor() {
        this.consultationState = {};
        console.log("Variable Dominio URL:", config.DOMINIO_URL);
        this.baseUrl = `${config.DOMINIO_URL}/images/`;
        this.IMAGE_DIR = "./temp";
        this.scheduleImageCleanup();
        //this.deleteOldImages();
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

    async detectKeywords(message) {
        const keywords = ["diagnostico", "cita", "ubicacion", "productos", "menu"];
        const normalizedMessage = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        return keywords.find(keyword => normalizedMessage.includes(keyword)) || null;
    }
    

    async handleTextMessage(message, senderInfo) {
        try {
            const incomingMessage = message.text.body.toLowerCase().trim();

            if (this.isGreeting(incomingMessage)) {
                await this.sendWelcomeSequence(message.from, senderInfo);
                return;
            }

            // Detectar si el mensaje coincide con un comando conocido
            const detectedOption = await this.detectKeywords(incomingMessage);
            if (detectedOption) {
                await this.handleMenuOption(message.from, detectedOption);
                return;
            }

            if (this.consultationState[message.from]) {
                await this.handleConsultationFlow(message.from, incomingMessage);
                return;
            }

            await whatsappService.sendMessage(
                message.from,
                "🤖 No estoy seguro de haber entendido. Puedes escribir *'menú'* para ver opciones disponibles o preguntar sobre nuestros servicios."
            );
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
        try {
            let state = stateManager.getState(phoneNumber);
            if (!state || state.step === "none") {
                state = {
                    paymentStatus: "pending", // Inicialmente el pago está pendiente
                    images: [],
                    step: "photo1",
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
                await whatsappService.sendMediaMessage(
                    phoneNumber,
                    "image",
                    this.baseUrl + "foto_espalda.jpg",
                    messages.SEGUNDA_FOTO_MESSAGE
                );
            } else if (state.step === "photo2") {
                state.photo2Id = imageId;
    
                //Ofrecer análisis completo
                await this.offerFullAnalysis(phoneNumber);
            }
    
            console.log(` Estado actualizado para ${phoneNumber}:`, state);
        } catch (error) {
            console.error("❌ Error en handleImageMessage:", error);
            await whatsappService.sendMessage(
                phoneNumber,
                messages.ERROR_IMAGE_MESSAGE
            );
        }
    }
    
    async handlePaymentVerification(phoneNumber) {
        try {
            const state = stateManager.getState(phoneNumber);
            if (state && state.paymentStatus === "verified") {
                console.log(
                    ` Pago verificado. Iniciando análisis completo para ${phoneNumber}...`
                );
                await this.processAnalysisAndSendResults(phoneNumber);
            } else {
                console.log(
                    `⏳ Esperando pago para ${phoneNumber} antes de proceder con el análisis completo.`
                );
            }
        } catch (error) {
            console.error("❌ Error en handlePaymentVerification:", error);
            await whatsappService.sendMessage(
                phoneNumber,
                "Ocurrió un error al verificar el pago."
            );
        }
    }

    async obtenerStatusImagen() {
        return true;
    }
    // -------------------------------------------------------------------------------------------------------------------------------------------------

    // --- Analysis and Results ---

    // En processAnalysisAndSendResults Versión Antigua
    // async processAnalysisAndSendResults(to) {
    //     console.log(`🚀 Ejecutando processAnalysisAndSendResults para ${to}`);
    //     try {
    //         const state = stateManager.getState(to);

    //         console.log("Estado actual:", {
    //             paymentStatus: state.paymentStatus,
    //             photo1Id: state.photo1Id,
    //             photo2Id: state.photo2Id,
    //         });
    //         if (
    //             !state ||
    //             state.paymentStatus !== "verified" ||
    //             !state.photo1Id ||
    //             !state.photo2Id
    //         ) {
    //             await this.sendErrorMessage(
    //                 to,
    //                 "El pago o las imágenes aún no están listos."
    //             );
    //             return;
    //         }

    //         console.log("id foto 1: ", state.photo1Id);
    //         console.log("id foto 2: ", state.photo2Id);

    //         // Descargar las imágenes
    //         const [photo1Path, photo2Path] = await Promise.all([
    //             whatsappService.downloadMedia(state.photo1Id),
    //             whatsappService.downloadMedia(state.photo2Id),
    //         ]);

    //         if (!photo1Path || !photo2Path) {
    //             console.error(
    //                 `⚠️ Error: No se pudieron descargar las imágenes. photo1Id: ${state.photo1Id}, photo2Id: ${state.photo2Id}`
    //             );
    //             await this.sendErrorMessage(
    //                 to,
    //                 "No se pudieron descargar las imágenes para el análisis."
    //             );
    //             return;
    //         }

    //         // Realizar el análisis completo
    //         const fullAnalysis = await geminiService.fullAnalysis(
    //             photo1Path,
    //             photo2Path,
    //             prompts.FULL_ANALYSIS
    //         );

    //         await whatsappService.sendMessage(to, fullAnalysis);

    //         // Guardar el análisis en el estado para usarlo luego
    //         state.fullAnalysis = fullAnalysis;
    //         stateManager.setState(to, state);

    //         await this.moreButtons(to);

    //         // ✅ Eliminar imágenes después del análisis
    //         try {
    //             await Promise.all([
    //                 fs.promises.unlink(photo1Path),
    //                 fs.promises.unlink(photo2Path)
    //             ]);
    //             console.log("🗑️ Imágenes eliminadas correctamente.");
    //         } catch (err) {
    //             console.error("❌ Error al eliminar las imágenes:", err);
    //         }

    //         // ✅ Limpiar el estado después de completar el análisis
    //         stateManager.deleteState(to);

    //     } catch (error) {
    //         console.error("Error en processAnalysisAndSendResults:", error);
    //         await this.sendErrorMessage(
    //             to,
    //             `Ocurrió un error al procesar el análisis completo: ${error}`
    //         );
    //     }
    // }

     // -------------------------------------------------------------------------------------------------------------------------------------------------

    // Process Analysis and Send Results VERSION MEJORADA
    async processAnalysisAndSendResults(to) {
    console.log(`🚀 Ejecutando processAnalysisAndSendResults para ${to}`);
    try {
        const state = stateManager.getState(to);

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
            await this.sendErrorMessage(
                to,
                "No se pudieron descargar las imágenes para el análisis."
            );
            return;
        }

        // Realizar el análisis completo con IA
        const fullAnalysis = await geminiService.fullAnalysis(
            photo1Path,
            photo2Path,
            prompts.FULL_ANALYSIS
        );

        // Verificar si está dentro de la ventana de 24h
        const timestamp = state.timestamp || Date.now();

        if (isWithin24h(timestamp)) {
            await whatsappService.sendMessage(to, fullAnalysis);
            await this.moreButtons(to);
            stateManager.deleteState(to); // Limpiar estado completo
        } else {
            // Fuera de la ventana → enviar plantilla aprobada
            await whatsappService.sendTemplateMessage(to, 'payment_analysis_ready', {
                body_parameters: [], // O por ejemplo: ["Claudia"] si tu plantilla tiene {{1}}
            });

            // Guardar el análisis en el estado para enviarlo si el usuario responde
            state.fullAnalysis = fullAnalysis;
            stateManager.setState(to, state);
            console.log(`📦 Análisis guardado en estado para ${to}, esperando confirmación del usuario.`);
        }

        // Eliminar imágenes después del análisis (en ambos casos)
        try {
            await Promise.all([
                fs.promises.unlink(photo1Path),
                fs.promises.unlink(photo2Path)
            ]);
            console.log("🗑️ Imágenes eliminadas correctamente.");
        } catch (err) {
            console.error("❌ Error al eliminar las imágenes:", err);
        }

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
                    await whatsappService.sendMessage(to, "¡Gracias por tu consulta 😊!, ¿En qué más puedo ayudarte?");
                    await this.moreButtons(to);
                    break;
                case "diagnostico":
                    await whatsappService.sendInteractiveButtons(
                        to,
                        "¿Estás seguro de que deseas iniciar el diagnóstico capilar?",
                        [
                            {
                                type: "reply",
                                reply: { id: "confirm_diagnostico", title: "Sí" },
                            },
                            {
                                type: "reply",
                                reply: { id: "menu", title: "No, volver al menú" },
                            },
                        ]
                    );
                    break;

                case "confirm_diagnostico":
                    stateManager.setState(to, {
                        paymentStatus: "verified", // O el estado de pago inicial que necesites
                        images: [],
                        step: "photo1",
                        photo1Id: null,
                        photo2Id: null,
                        timestamp: Date.now(),
                    });
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
                    await this.sendHelpButtons(to);
                    break;
                case "productos":
                    await whatsappService.sendMessage(to, messages.PRODUCTOS_MESSAGE);
                    await this.sendHelpButtons(to);
                    break;
                case "ubicacion":
                    await this.sendLocationInfo(to); // Reutilización de función
                    await whatsappService.sendMessage(to, messages.HORARIOS_MESSAGE);
                    await this.sendHelpButtons(to);
                    break;
                case "terminar":
                    await whatsappService.sendMessage(to, messages.DESPEDIDA_MESSAGE);
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
        const greetingRegex = /^(hola|hello|hi|hey|buenas|buen[oa]s?\s?(d[ií]a|d[ií]as|tarde|tardes|noche|noches)|qué tal|saludos|cómo estás|qué onda)/i;
        return greetingRegex.test(message.toLowerCase().trim());
    }
    
    getSenderName(senderInfo) {
        return senderInfo.profile?.name || senderInfo.wa_id;
    }

    async sendContact(to) {
        const contact = this.getContactInfo();
        await whatsappService.sendContactMessage(to, contact);
    }
    
    getContactInfo() {
        return {
            addresses: [{ 
                street: "Cra 31 #50 - 21", 
                city: "Bucaramanga", 
                type: "WORK" 
            }],
            emails: [{ email: "tecniclaud@gmail.com", type: "WORK" }],
            name: {
                formatted_name: "Asesora Cosmética",
                first_name: "Claudia",
                last_name: "Moreno"
            },
            org: { 
                company: "Claudia Moreno", 
                department: "Atención al Cliente", 
                title: "Técnico Colorista"  
            },
            phones: [{ phone: "+573224457046", wa_id: "573224457046", type: "WORK" }],
            urls: [{ url: "https://diagnosticosclaudiamoreno.com/", type: "WORK" }]
        };
    }
    

    async sendWelcomeMenu(to) {
        const sections = [
            {
                title: "Opciones Principales",
                rows: [
                    { id: "diagnostico", title: "✨Diagnóstico Capilar✨" },
                    { id: "cita", title: "Cita con Profesional 💇🏻‍♀️" },
                    { id: "productos", title: "Ver Productos🧴" },
                    { id: "ubicacion", title: "Ubicación 📍" },
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
        const message = messages.OFRECER_FULLANALYSIS_MESSAGE;
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

    async moreButtons(to) {
        await whatsappService.sendInteractiveButtons(
            to,
            "Te puede interesar:",
            [
                { type: "reply", reply: { id: "cita", title: "Agendar Cita 💇🏻‍♀️" } },
                {
                    type: "reply",
                    reply: { id: "productos", title: "Comprar Productos🧴" },
                },
                {
                    type: "reply",
                    reply: { id: "diagnostico", title: "✨Nuevo Diagnóstico✨" },
                },
            ]
        );
    }

    async sendLocationInfo(to) {
        const latitude = 7.114296;
        const longitude = -73.112385;
        const name = "Claudia Moreno";
        const address = "📌 Cra. 31 #50 - 21, Sotomayor, Bucaramanga, Santander";
        await whatsappService.sendLocationMessage(
            to,
            latitude,
            longitude,
            name,
            address
        );
    }

    // Función para eliminar imágenes de más de 24 horas
    deleteOldImages() {
        try {
            const files = fs.readdirSync(this.IMAGE_DIR);
            const now = Date.now();

            files.forEach(file => {
                const filePath = `${this.IMAGE_DIR}/${file}`;
                const stats = fs.statSync(filePath);

                if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Imagen eliminada: ${file}`);
                }
            });

            console.log("✅ Limpieza de imágenes completada.");
        } catch (error) {
            console.error("❌ Error eliminando imágenes:", error);
        }
    }

    // Programar eliminación automática de imágenes
    scheduleImageCleanup() {
        cron.schedule("0 0 * * *", () => {
            console.log("⏳ Ejecutando limpieza de imágenes...");
            this.deleteOldImages();
        });
    }


    // --- Error Handling ---

    async sendErrorMessage(to, errorMessage) {
        console.error(errorMessage);
        await whatsappService.sendMessage(to, errorMessage);
    }
}


export default new MessageHandler();
