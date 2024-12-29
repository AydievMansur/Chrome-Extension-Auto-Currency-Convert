class CurrencyConverter {
    constructor() {
        this.rates = null;
        this.fromCurrency = 'USD';
        this.toCurrency = 'RUB';
        this.amount = 1;
        this.lastFetch = null;
        this.selectionMode = false;
        this.currencyNames = {
            USD: 'US Dollar',
            EUR: 'Euro',
            GBP: 'British Pound',
            JPY: 'Japanese Yen',
            AUD: 'Australian Dollar',
            CAD: 'Canadian Dollar',
            CHF: 'Swiss Franc',
            CNY: 'Chinese Yuan',
            RUB: 'Russian Ruble',
            // It will be fetched from the API
        };

        this.initializeElements();
        this.loadRates();
        this.setupEventListeners();
        this.loadPreferences();
        this.setupMessageListener();
    }

    async initializeElements() {
        this.fromBox = document.getElementById('fromCurrency');
        this.toBox = document.getElementById('toCurrency');
        this.fromCode = this.fromBox.querySelector('.currency-code');
        this.toCode = this.toBox.querySelector('.currency-code');
        this.fromAmount = this.fromBox.querySelector('.currency-amount');
        this.toAmount = this.toBox.querySelector('.currency-amount');
        this.switchButton = document.querySelector('.switch-button');
        this.dropdown = document.getElementById('currencyDropdown');
        this.rateInfo = document.querySelector('.rate-info');
        this.selectModeButton = document.getElementById('selectModeButton');

        const container = document.querySelector('.currency-container');
        const manifestData = await this.getManifestData();
        const appInfoDiv = document.createElement('div');
        appInfoDiv.className = 'app-info';
        appInfoDiv.innerHTML = `
            <span>${manifestData.name} v${manifestData.version}</span>
            <a href="https://github.com/fosterushka/Chrome-Extension-Auto-Currency-Convert" target="_blank">GitHub</a>
        `;
        container.appendChild(appInfoDiv);
    }

    async getManifestData() {
        try {
            const manifestResponse = await fetch(chrome.runtime.getURL('manifest.json'));
            return await manifestResponse.json();
        } catch (error) {
            console.error('Error loading manifest:', error);
            return { name: 'PricyMorph', version: '1.0.0' };
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'selectionModeChanged') {
                this.selectionMode = message.selectionMode;
                this.updateSelectionButton();
            }
            return true;
        });
    }

    updateSelectionButton() {
        this.selectModeButton.classList.toggle('active', this.selectionMode);
        this.selectModeButton.textContent = this.selectionMode ?
            ' Exit Selection Mode' :
            ' Select Price Element';
    }

    async loadPreferences() {
        const prefs = await chrome.storage.local.get(['fromCurrency', 'toCurrency']);
        if (prefs.fromCurrency) {
            this.fromCurrency = prefs.fromCurrency;
            this.fromCode.textContent = prefs.fromCurrency;
        }
        if (prefs.toCurrency) {
            this.toCurrency = prefs.toCurrency;
            this.toCode.textContent = prefs.toCurrency;
        }
        this.updateConversion();
    }

    async loadRates() {
        try {
            const stored = localStorage.getItem('currencyRates');
            const storedTime = localStorage.getItem('lastFetchTime');

            if (stored && storedTime) {
                const timeDiff = Date.now() - parseInt(storedTime);
                if (timeDiff < 24 * 60 * 60 * 1000) {
                    this.rates = JSON.parse(stored);
                    this.updateConversion();
                    return;
                }
            }

            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await response.json();
            this.rates = data.rates;
            localStorage.setItem('currencyRates', JSON.stringify(this.rates));
            localStorage.setItem('lastFetchTime', Date.now().toString());

            this.updateConversion();
        } catch (error) {
            console.error('Error fetching rates:', error);
        }
    }

    setupEventListeners() {
        this.fromCode.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDropdown('from');
        });

        this.toCode.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDropdown('to');
        });

        this.switchButton.addEventListener('click', () => this.switchCurrencies());
        this.selectModeButton.addEventListener('click', () => this.toggleSelectionMode());

        this.fromAmount.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        this.toAmount.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.fromAmount.addEventListener('input', (e) => {
            this.handleAmountInput(e, 'from');
        });
        this.toAmount.addEventListener('input', (e) => {
            this.handleAmountInput(e, 'to');
        });

        this.fromAmount.addEventListener('keypress', this.validateNumericInput);
        this.toAmount.addEventListener('keypress', this.validateNumericInput);

        document.addEventListener('click', (e) => {
            const clickedFromCode = this.fromCode.contains(e.target);
            const clickedToCode = this.toCode.contains(e.target);
            const clickedDropdown = this.dropdown.contains(e.target);
            
            if (!clickedDropdown && !clickedFromCode && !clickedToCode) {
                this.dropdown.style.display = 'none';
            }
        });
    }

    validateNumericInput(e) {
        if (!/[\d.]/.test(e.key) &&
            e.key !== 'Backspace' &&
            e.key !== 'Delete' &&
            e.key !== 'ArrowLeft' &&
            e.key !== 'ArrowRight') {
            e.preventDefault();
        }

        if (e.key === '.' && e.target.textContent.includes('.')) {
            e.preventDefault();
        }
    }

    handleAmountInput(e, direction) {
        const value = e.target.textContent.trim();
        const numValue = parseFloat(value) || 0;

        if (direction === 'from') {
            this.amount = numValue;
            this.updateConversion();
        } else {
            this.amount = this.convertBack(numValue);
            this.updateConversion(true);
        }
    }

    convertBack(amount) {
        if (!this.rates) return amount;
        const fromRate = this.rates[this.fromCurrency];
        const toRate = this.rates[this.toCurrency];
        return (amount * fromRate) / toRate;
    }

    updateConversion(skipFrom = false) {
        if (!this.rates) return;

        const fromRate = this.rates[this.fromCurrency];
        const toRate = this.rates[this.toCurrency];
        const convertedAmount = (this.amount * toRate) / fromRate;

        if (!skipFrom) {
            this.fromAmount.textContent = this.amount.toFixed(2);
        }
        this.toAmount.textContent = convertedAmount.toFixed(2);
        this.rateInfo.textContent = `1 ${this.fromCurrency} = ${(toRate / fromRate).toFixed(2)} ${this.toCurrency}`;
    }

    switchCurrencies() {
        [this.fromCurrency, this.toCurrency] = [this.toCurrency, this.fromCurrency];
        this.fromCode.textContent = this.fromCurrency;
        this.toCode.textContent = this.toCurrency;

        chrome.storage.local.set({
            fromCurrency: this.fromCurrency,
            toCurrency: this.toCurrency
        });

        this.updateConversion();
    }

    async toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        this.updateSelectionButton();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, {
            action: 'toggleSelection',
            selectionMode: this.selectionMode
        });
    }

    showDropdown(type) {
        const currencies = Object.keys(this.rates || this.currencyNames);
        const isVisible = this.dropdown.style.display === 'flex' || this.dropdown.style.display === 'block';
        const isSameType = this.dropdown.dataset.type === type;
        
        if (isVisible && isSameType) {
            this.dropdown.style.display = 'none';
            return;
        }
        this.dropdown.innerHTML = `
            <div class="currency-search">
                <input type="text" placeholder="Search currency..." />
            </div>
            <div class="currency-list">
                ${currencies.map(code => `
                    <div class="currency-option" data-code="${code}">
                        <div class="currency-option-left">
                            <span class="currency-code-option">${code}</span>
                            <span class="currency-name">${this.currencyNames[code] || code}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.dropdown.dataset.type = type;

        const activeBox = type === 'from' ? this.fromBox : this.toBox;
        const boxRect = activeBox.getBoundingClientRect();
        const containerRect = this.dropdown.parentElement.getBoundingClientRect();

        this.dropdown.style.display = 'block';
        this.dropdown.style.top = `${boxRect.bottom - containerRect.top + 5}px`;

        const availableSpace = containerRect.height - (boxRect.bottom - containerRect.top) - 10;
        const minDropdownHeight = 150; //TODO: HAVE TO FIX IT AND MAKE AUTO
        const maxDropdownHeight = Math.max(minDropdownHeight, Math.min(300, availableSpace));

        this.dropdown.style.maxHeight = `${maxDropdownHeight}px`;

        //TODO: FIX THAT CUZ NOW HARDCODED Adjust the currency list height to account for search input
        const searchHeight = this.dropdown.querySelector('.currency-search').offsetHeight;
        const currencyList = this.dropdown.querySelector('.currency-list');
        currencyList.style.maxHeight = `${maxDropdownHeight - searchHeight}px`;

        const searchInput = this.dropdown.querySelector('input');
        searchInput.focus();

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const options = this.dropdown.querySelectorAll('.currency-option');

            options.forEach(option => {
                const code = option.dataset.code.toLowerCase();
                const name = (this.currencyNames[option.dataset.code] || '').toLowerCase();
                const matches = code.includes(searchTerm) || name.includes(searchTerm);
                option.style.display = matches ? 'flex' : 'none';
            });
        });

        const options = this.dropdown.querySelectorAll('.currency-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                const code = option.dataset.code;
                if (type === 'from') {
                    this.fromCurrency = code;
                    this.fromCode.textContent = code;
                } else {
                    this.toCurrency = code;
                    this.toCode.textContent = code;
                }

                chrome.storage.local.set({
                    fromCurrency: this.fromCurrency,
                    toCurrency: this.toCurrency
                });

                this.updateConversion();
                if (this.selectionMode) {
                    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                        if (tab) {
                            chrome.tabs.sendMessage(tab.id, {
                                action: 'currencyUpdated',
                                fromCurrency: this.fromCurrency,
                                toCurrency: this.toCurrency
                            });
                        }
                    });
                }

                this.dropdown.style.display = 'none';
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CurrencyConverter();
});
