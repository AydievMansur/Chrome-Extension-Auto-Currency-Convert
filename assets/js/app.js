class DOMCurrencyConverter {
    constructor() {
        this.rates = null;
        this.fromCurrency = 'USD';
        this.toCurrency = 'RUB';
        this.amount = 1;
        this.convertedElements = new Map();
        this.selectionMode = false;
        this.highlightOverlay = null;
        this.currentDropdownType = null;
        this.observer = null;
        this.updateTimeout = null;

        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleCurrencyChange = this.handleCurrencyChange.bind(this);
        this.handleSwitchCurrencies = this.handleSwitchCurrencies.bind(this);
        this.toggleSelectionMode = this.toggleSelectionMode.bind(this);

        this.debouncedHandleMouseMove = this.debounce(this.handleMouseMove, 16);
        this.debouncedUpdatePrices = this.debounce(this.updateAllPrices.bind(this), 100);

        this.initialize();
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async initialize() {
        try {
            await this.loadPreferences();
            await this.loadRates();
            this.setupMessageListener();
            this.setupMutationObserver();
            this.createHighlightOverlay();

            if (chrome.runtime?.id) {
                this.initializePopup();
            }

            console.debug('DOMCurrencyConverter initialized with:', {
                fromCurrency: this.fromCurrency,
                toCurrency: this.toCurrency
            });
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    initializePopup() {
        this.fromBox = document.getElementById('fromCurrency');
        this.toBox = document.getElementById('toCurrency');
        this.switchButton = document.querySelector('.switch-button');
        this.dropdown = document.getElementById('currencyDropdown');
        this.rateInfo = document.querySelector('.rate-info');
        this.selectModeButton = document.getElementById('selectModeButton');

        this.fromBox?.addEventListener('click', () => this.showDropdown('from'));
        this.toBox?.addEventListener('click', () => this.showDropdown('to'));
        this.switchButton?.addEventListener('click', this.handleSwitchCurrencies);
        this.selectModeButton?.addEventListener('click', () => {
            this.selectionMode = !this.selectionMode;
            this.toggleSelectionMode(this.selectionMode);
        });

        document.addEventListener('click', (e) => {
            if (this.dropdown && !this.dropdown.contains(e.target) &&
                !this.fromBox.contains(e.target) &&
                !this.toBox.contains(e.target)) {
                this.dropdown.style.display = 'none';
                this.currentDropdownType = null;
            }
        });

        this.updatePopupUI();
    }

    async loadPreferences() {
        const prefs = await chrome.storage.local.get(['fromCurrency', 'toCurrency']);
        if (prefs.fromCurrency) this.fromCurrency = prefs.fromCurrency;
        if (prefs.toCurrency) this.toCurrency = prefs.toCurrency;
    }

    async loadRates() {
        try {
            const stored = localStorage.getItem('currencyRates');
            const storedTime = localStorage.getItem('lastFetchTime');

            if (stored && storedTime) {
                const timeDiff = Date.now() - parseInt(storedTime);
                if (timeDiff < 24 * 60 * 60 * 1000) {
                    this.rates = JSON.parse(stored);
                    this.updatePopupUI();
                    return;
                }
            }

            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await response.json();
            this.rates = data.rates;
            localStorage.setItem('currencyRates', JSON.stringify(this.rates));
            localStorage.setItem('lastFetchTime', Date.now().toString());
            this.updatePopupUI();
        } catch (error) {
            console.error('Error fetching rates:', error);
            const stored = localStorage.getItem('currencyRates');
            if (stored) {
                this.rates = JSON.parse(stored);
                this.updatePopupUI();
            }
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'toggleSelection') {
                this.toggleSelectionMode(message.selectionMode);
                sendResponse({ success: true });
            } else if (message.action === 'currencyUpdated') {
                this.fromCurrency = message.fromCurrency;
                this.toCurrency = message.toCurrency;
                this.debouncedUpdatePrices();
                sendResponse({ success: true });
            }
            return true;
        });
    }

    createHighlightOverlay() {
        if (document.body) {
            this.highlightOverlay = document.createElement('div');
            this.highlightOverlay.style.cssText = `
                position: fixed;
                pointer-events: none;
                z-index: 10000;
                border: 2px solid #4a9eff;
                border-radius: 4px;
                background: rgba(74, 158, 255, 0.1);
                display: none;
            `;
            document.body.appendChild(this.highlightOverlay);
        }
    }

    toggleSelectionMode(enabled = !this.selectionMode) {
        this.selectionMode = enabled;

        if (document.body) {
            document.body.style.cursor = enabled ? 'crosshair' : '';
        }

        if (enabled) {
            document.addEventListener('mousemove', this.debouncedHandleMouseMove);
            document.addEventListener('click', this.handleClick);
        } else {
            if (this.highlightOverlay) {
                this.highlightOverlay.style.display = 'none';
            }
            document.removeEventListener('mousemove', this.debouncedHandleMouseMove);
            document.removeEventListener('click', this.handleClick);
        }

        this.updateSelectionButton();
    }

    updateSelectionButton() {
        if (this.selectModeButton) {
            this.selectModeButton.classList.toggle('active', this.selectionMode);
            this.selectModeButton.textContent = this.selectionMode ?
                '🎯 Exit Selection Mode' :
                '🎯 Select Price Element';
        }
    }

    handleMouseMove(e) {
        if (!this.selectionMode) return;

        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (!element) return;

        const priceElement = this.findPriceElement(element);
        if (priceElement && this.highlightOverlay) {
            const rect = priceElement.getBoundingClientRect();
            this.highlightOverlay.style.display = 'block';
            this.highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
            this.highlightOverlay.style.left = `${rect.left}px`;
            this.highlightOverlay.style.width = `${rect.width}px`;
            this.highlightOverlay.style.height = `${rect.height}px`;
        } else if (this.highlightOverlay) {
            this.highlightOverlay.style.display = 'none';
        }
    }

    handleClick(e) {
        if (!this.selectionMode) return;

        e.preventDefault();
        e.stopPropagation();

        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (!element) return;

        const priceElement = this.findPriceElement(element);
        if (priceElement) {
            this.convertPrice(priceElement);
            if (this.highlightOverlay) {
                this.highlightOverlay.style.display = 'none';
            }
            
            this.selectionMode = false;
            this.toggleSelectionMode(false);
            
            this.updateSelectionButton();
        }
    }

    findPriceElement(element) {
        let current = element;
        for (let i = 0; i < 4; i++) {
            if (!current) break;
            if (this.extractPrice(current.textContent)) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    setupMutationObserver() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver(mutations => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    const affectedElement = [...this.convertedElements.keys()].some(element => {
                        return mutation.target.contains(element) || element.contains(mutation.target);
                    });
                    if (affectedElement) {
                        shouldUpdate = true;
                        break;
                    }
                }
            }
            if (shouldUpdate) {
                this.debouncedUpdatePrices();
            }
        });

        if (document.body) {
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    }

    updateAllPrices() {
        this.convertedElements.forEach((originalData, element) => {
            if (document.contains(element)) {
                this.updateConvertedPrice(element, originalData);
            } else {
                this.convertedElements.delete(element);
            }
        });
    }

    extractPrice(text) {
        if (!text) return null;
        const priceRegex = /[\$€£¥]?\s*\d+([.,]\d{1,2})?|\d+([.,]\d{1,2})?\s*[\$€£¥]/;
        const match = text.match(priceRegex);
        if (!match) return null;

        const price = match[0].replace(/[^\d.,]/g, '').replace(',', '.');
        const value = parseFloat(price);
        return isNaN(value) ? null : value;
    }

    async convertPrice(element) {
        if (!this.rates || !element) return;

        const originalText = element.textContent.trim();
        const price = this.extractPrice(originalText);

        if (!price) return;

        if (!this.convertedElements.has(element)) {
            this.convertedElements.set(element, {
                price,
                text: originalText,
                currency: this.fromCurrency
            });
        }

        this.updateConvertedPrice(element, this.convertedElements.get(element));
    }

    updateConvertedPrice(element, originalData) {
        if (!this.rates || !element || !originalData) return;

        const rate = this.rates[this.toCurrency] / this.rates[originalData.currency];
        const convertedPrice = originalData.price * rate;

        const formattedPrice = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: this.toCurrency
        }).format(convertedPrice);

        element.textContent = formattedPrice;
    }

    showDropdown(type) {
        if (!this.dropdown || !this.rates) return;

        if (this.currentDropdownType === type) {
            this.dropdown.style.display = 'none';
            this.currentDropdownType = null;
            return;
        }

        const box = type === 'from' ? this.fromBox : this.toBox;
        const rect = box.getBoundingClientRect();

        this.dropdown.style.top = `${rect.bottom}px`;
        this.dropdown.style.left = `${rect.left}px`;
        this.dropdown.style.display = 'block';
        this.currentDropdownType = type;

        const newDropdown = this.dropdown.cloneNode(false);
        this.dropdown.parentNode.replaceChild(newDropdown, this.dropdown);
        this.dropdown = newDropdown;

        this.dropdown.innerHTML = Object.keys(this.rates)
            .sort()
            .map(currency => `
                <div class="currency-option" data-currency="${currency}" data-type="${type}">
                    ${currency}
                </div>
            `).join('');

        this.dropdown.querySelectorAll('.currency-option').forEach(option => {
            option.addEventListener('click', this.handleCurrencyChange);
        });
    }

    handleCurrencyChange(e) {
        const currency = e.target.dataset.currency;
        const type = e.target.dataset.type;

        if (type === 'from') {
            this.fromCurrency = currency;
        } else {
            this.toCurrency = currency;
        }

        this.updatePopupUI();
        this.currentDropdownType = null;  // Reset dropdown state
        if (this.dropdown) {
            this.dropdown.style.display = 'none';
        }

        chrome.storage.local.set({
            fromCurrency: this.fromCurrency,
            toCurrency: this.toCurrency
        });
    }

    handleSwitchCurrencies() {
        [this.fromCurrency, this.toCurrency] = [this.toCurrency, this.fromCurrency];
        this.updatePopupUI();

        chrome.storage.local.set({
            fromCurrency: this.fromCurrency,
            toCurrency: this.toCurrency
        });
    }

    updatePopupUI() {
        if (!this.rates || !this.fromBox || !this.toBox || !this.rateInfo) return;

        const rate = this.rates[this.toCurrency] / this.rates[this.fromCurrency];
        const convertedAmount = this.amount * rate;

        this.fromBox.querySelector('.currency-code').textContent = this.fromCurrency;
        this.fromBox.querySelector('.currency-amount').textContent = this.amount.toFixed(2);

        this.toBox.querySelector('.currency-code').textContent = this.toCurrency;
        this.toBox.querySelector('.currency-amount').textContent = convertedAmount.toFixed(2);

        this.rateInfo.textContent = `1 ${this.fromCurrency} = ${rate.toFixed(2)} ${this.toCurrency}`;
    }

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        document.removeEventListener('mousemove', this.debouncedHandleMouseMove);
        document.removeEventListener('click', this.handleClick);
        
        if (this.highlightOverlay && this.highlightOverlay.parentNode) {
            this.highlightOverlay.parentNode.removeChild(this.highlightOverlay);
        }
        
        this.convertedElements.clear();
        
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
    }
}

if (document.body) {
    const converter = new DOMCurrencyConverter();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        new DOMCurrencyConverter();
    });
}