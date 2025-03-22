// stateManager.js
class stateManager {
    constructor() {
        this.consultationState = {};
    }

    getState(phoneNumber) {
        return this.consultationState[phoneNumber];
    }

    setState(phoneNumber, state) {
        this.consultationState[phoneNumber] = state;
    }

    deleteState(phoneNumber) {
        delete this.consultationState[phoneNumber];
    }
}

export default new stateManager();