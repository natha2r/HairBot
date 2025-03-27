import whatsappService from "./whatsappService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";
import paymentController from "../controllers/paymentController.js";
import stateManager from "./stateManager.js";
import { prompts } from "./prompts.js";
import fs from "fs";
import cron from "node-cron";

class MessageHandler {
    constructor() {
        this.consultationState = {};
        this.baseUrl = "https://8spn764p-3000.use2.devtunnels.ms/images/"; //https://hairbot-production.up.railway.app/webhook
        this.IMAGE_DIR = "./temp";
        this.scheduleImageCleanup();
        this.deleteOldImages();
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
        const keywords = {
            "diagnostico": "diagnostico",
            "cita": "cita",
            "ubicacion": "ubicacion",
            "productos": "productos",
            "menu": "menu"
        };

        const normalizedMessage = message
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    
        for (const key in keywords) {
            if (normalizedMessage.includes(key)) {
                return keywords[key];
            }
        }
    
        return null;
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
                    paymentStatus: "verified", // Asumimos que el pago sigue válido
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

                // ⏳ Establecer un recordatorio en 5 minutos si no envía la segunda foto
                setTimeout(async () => {
                    const updatedState = stateManager.getState(phoneNumber);
                    if (
                        updatedState &&
                        updatedState.step === "photo2" &&
                        !updatedState.photo2Id
                    ) {
                        await whatsappService.sendMessage(
                            phoneNumber,
                            "📸 ¿Aún estás ahí? Envíanos la segunda foto para continuar con tu diagnóstico."
                        );
                    }
                }, 30000); // 5 minutos

                setTimeout(async () => {
                    const updatedState = stateManager.getState(phoneNumber);
                    if (updatedState && updatedState.step === "photo2" && !updatedState.photo2Id) {
                        await whatsappService.sendMessage(phoneNumber, "⏳ Hemos cancelado el proceso por inactividad. Si deseas intentarlo de nuevo, envía 'diagnóstico'.");
                        stateManager.setState(phoneNumber, { step: "none" }); // Restablecer el estado
                    }
                }, 900000); // 15 minutos


            } else if (state.step === "photo2") {
                state.photo2Id = imageId;

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

    // --- Analysis --

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

            const preliminaryResponse = await geminiService.preliminaryAnalysis(
                photo1Path,
                photo2Path,
                prompts.PRELIMINARY_ANALYSIS
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
            const fullAnalysis = await geminiService.fullAnalysis(
                photo1Path,
                photo2Path,
                prompts.FULL_ANALYSIS
            );

            await whatsappService.sendMessage(to, fullAnalysis);

            // Guardar el análisis en el estado para usarlo luego
            state.fullAnalysis = fullAnalysis;
            stateManager.setState(to, state);

            await this.moreButtons(to);

            // ✅ Eliminar imágenes después del análisis
            try {
                await Promise.all([
                    fs.promises.unlink(photo1Path),
                    fs.promises.unlink(photo2Path)
                ]);
                console.log("🗑️ Imágenes eliminadas correctamente.");
            } catch (err) {
                console.error("❌ Error al eliminar las imágenes:", err);
            }

            // ✅ Limpiar el estado después de completar el análisis
            stateManager.deleteState(to);

        } catch (error) {
            console.error("Error en processAnalysisAndSendResults:", error);
            await this.sendErrorMessage(
                to,
                `Ocurrió un error al procesar el análisis completo: ${error}`
            );
        }
    }

    async offerProducts(to) {
        const message =
            "¿Deseas ver productos que te ayuden a mejorar la salud de tu cuero cabelludo y cabello?";
        const buttons = [
            { type: "reply", reply: { id: "products_yes", title: "Sí" } },
            { type: "reply", reply: { id: "products_no", title: "No" } },
        ];
        await whatsappService.sendInteractiveButtons(to, message, buttons);
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
                    await whatsappService.sendMessage(to, messages.DESPEDIDA_MESSAGE);
                    break;
                case "menu":
                    await this.sendWelcomeMenu(to);
                    break;
                case "nuevo_analisis": // Manejar la opción "Realizar nuevo análisis"
                    await whatsappService.sendMessage(
                        to,
                        "Vamos a realizar un nuevo análisis. Por favor, envía la primera foto de tu cuero cabelludo."
                    );
                    stateManager.deleteState(to);
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
        const greetingRegex = /^(hola|hello|hi|buenas|buen día|qué tal|saludos)/i;
        return greetingRegex.test(message);
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
                formatted_name: "Tricóloga  Claudia Moreno",
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
            "Puedes ver más opciones aquí:",
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
