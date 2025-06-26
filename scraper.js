const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs-extra');

class RestaurantScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = [];
    }

    async init() {
        this.browser = await chromium.launch({
            headless: true,  // run in headless mode for CLI/testing
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor'
            ]
        });
        this.page = await this.browser.newPage();

        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        await this.page.setViewportSize({ width: 1920, height: 1080 });

        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });
    }

    async searchRestaurants(city, query = 'türk restoran') {
        const searchQuery = `${query} ${city} almanya`;
        const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

        console.log(`Searching for: ${searchQuery}`);
        await this.page.goto(url, { waitUntil: 'networkidle' });
        

        try {
            // "Consent" (Çerez) ekranını bekleyip kabul etme
            const consentButton = await this.page.waitForSelector('button:has-text("Akzeptieren")', { timeout: 15000 });
            await consentButton.click();
            console.log('Accepted cookies.');
            await this.page.waitForTimeout(2000); // Sayfanın oturması için kısa bir bekleme
        } catch (error) {
            console.log('Cookie consent screen not found, continuing...');
        }


        try {
            await this.page.waitForSelector('[role="feed"]', { timeout: 15000 });
        } catch (error) {
            console.log('Feed selector not found, trying alternative...');
            await this.page.waitForSelector('div[role="main"]', { timeout: 10000 });
        }

        await this.page.waitForTimeout(3000);
        // Load all results by scrolling through the feed
        await this.scrollAndLoadResults();

        const restaurantElements = await this.page.$$('[role="feed"] > div > div > a[href*="/maps/place/"]');
        console.log(`Found ${restaurantElements.length} restaurants`);
        // Iterate over all loaded restaurant entries
        for (let i = 0; i < restaurantElements.length; i++) {
            try {
                // Her döngüde elementleri yeniden bulmak, "stale" element hatalarını önler
                const elements = await this.page.$$('[role="feed"] > div > div > a[href*="/maps/place/"]');
                if (elements[i]) {
                    await this.extractRestaurantData(elements[i], i);
                }
                const delay = Math.random() * 1500 + 1000; // Bekleme süresini biraz kısalttım
                await this.page.waitForTimeout(delay);
            } catch (error) {
                console.log(`Error processing restaurant ${i}: ${error.message}`);
            }
        }
    }

    async scrollAndLoadResults() {
        const feedSelector = '[role="feed"]';
        try {
            await this.page.waitForSelector(feedSelector, { timeout: 10000 });
        } catch (error) {
            console.log('Feed not found for scrolling, continuing...');
            return;
        }

        let previousHeight = -1;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Artan sayıda kaydırma ile tüm sonuçları yükle

        while (scrollAttempts < maxScrollAttempts) {
            await this.page.evaluate((selector) => {
                const feed = document.querySelector(selector);
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
            }, feedSelector);

            await this.page.waitForTimeout(2500); // Daha uzun bekleme

            const currentHeight = await this.page.evaluate((selector) => {
                const feed = document.querySelector(selector);
                return feed ? feed.scrollHeight : 0;
            }, feedSelector);

            if (currentHeight === previousHeight) {
                console.log("Reached end of list or no new content loaded.");
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
            }

            previousHeight = currentHeight;
        }
    }

    async extractRestaurantData(element, index) {
        try {
            console.log(`Processing restaurant ${index + 1}...`);
            
            await element.click({ timeout: 10000 });
            // Sayfanın yüklenmesini beklemek için daha güvenilir bir yöntem
            await this.page.waitForSelector('h1', { timeout: 10000 });
            await this.page.waitForTimeout(2000); // Ekstra bekleme

            const restaurantData = await this.page.evaluate(() => {
                const getElementText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.textContent.trim() : '';
                };
                
                const getElementAttribute = (selector, attribute) => {
                    const el = document.querySelector(selector);
                    return el ? el.getAttribute(attribute) : '';
                }

                const data = {
                    name: getElementText('h1.DUwDvf.lfPIob') || getElementText('h1'),
                    address: getElementText('button[data-item-id="address"] .Io6YTe') || getElementText('[data-item-id*="address"]'),
                    phone: getElementText('button[data-item-id*="phone"] .Io6YTe') || getElementText('[data-item-id*="phone"]'),
                    website: getElementAttribute('a[data-item-id="authority"]', 'href') || 
                             getElementText('div.Io6YTe.fontBodyMedium.kR99db.fdkmkc') ||
                             getElementText('[data-item-id="authority"]'),
                    rating: getElementText('.F7nice span[aria-hidden="true"]'),
                    reviewCount: getElementText('.F7nice button'),
                    category: getElementText('button[jsaction*="category"]'),
                    hours: '',
                    whatsapp: '',
                    email: '',
                    socialMedia: {
                        facebook: '',
                        instagram: '',
                        twitter: ''
                    }
                };

                // Diğer bilgileri bulmak için daha genel seçiciler
                document.querySelectorAll('.rogA2c .Io6YTe').forEach(el => {
                    const parentButton = el.closest('button');
                    if (parentButton) {
                        const ariaLabel = parentButton.getAttribute('aria-label') || '';
                        const dataItemId = parentButton.getAttribute('data-item-id') || '';

                        if (dataItemId.includes('phone') && !data.phone) {
                            data.phone = el.textContent.trim();
                        }
                        if (dataItemId.includes('address') && !data.address) {
                            data.address = el.textContent.trim();
                        }
                    }
                });
                
                document.querySelectorAll('a[href*="whatsapp"]').forEach(link => { data.whatsapp = link.href; });
                document.querySelectorAll('a[href*="mailto"]').forEach(link => { data.email = link.href.replace('mailto:', ''); });
                document.querySelectorAll('a[href*="facebook.com"]').forEach(link => { data.socialMedia.facebook = link.href; });
                document.querySelectorAll('a[href*="instagram.com"]').forEach(link => { data.socialMedia.instagram = link.href; });
                document.querySelectorAll('a[href*="twitter.com"]').forEach(link => { data.socialMedia.twitter = link.href; });

                return data;
            });

            if (restaurantData.name && 
                restaurantData.name.length > 2 && 
                restaurantData.name !== 'Ergebnisse' &&
                !restaurantData.name.includes('Results') &&
                !restaurantData.name.includes('Sonuç')) {
                
                restaurantData.index = index + 1;
                restaurantData.scrapedAt = new Date().toISOString();

                this.normalizeData(restaurantData);
                this.results.push(restaurantData);
                console.log(`✓ Scraped: ${restaurantData.name}`);
            } else {
                console.log(`✗ Skipped invalid data: ${restaurantData.name || 'No name'}`);
            }
             // Geri dönmeden önce bekle
             await this.page.waitForTimeout(1000);
             // Geri tuşuna basmak yerine arama sonuçları listesine geri dön
             // Bu her zaman gerekli olmayabilir, test edilmeli
             if(await this.page.$('button[aria-label="Back to results"]')){
                await this.page.click('button[aria-label="Back to results"]');
                await this.page.waitForSelector('[role="feed"]', { timeout: 10000 });
             }


        } catch (error) {
            console.log(`Error extracting data for restaurant ${index + 1}: ${error.message}`);
            // Hata durumunda bir sonraki restorana geçmeden önce ana sayfaya geri dönmeyi deneyebiliriz.
            await this.page.goBack({waitUntil: "networkidle"});
        }
    }


    normalizeData(data) {
        if (data.phone) {
            data.phone = data.phone.replace(/[^\d+\-\s()]/g, '').trim();
        }
        if (data.address) {
            data.address = data.address.replace(/\s+/g, ' ').trim();
        }
        if (data.website && !data.website.startsWith('http')) {
            if (data.website.includes('.')) {
                data.website = 'https://' + data.website;
            }
        }
        if (data.rating) {
            const ratingMatch = data.rating.match(/[\d,.]+/);
            data.rating = ratingMatch ? ratingMatch[0].replace(',', '.') : '';
        }
        if(data.reviewCount) {
            data.reviewCount = data.reviewCount.replace(/[^\d]/g, ''); // Sadece rakamları al
        }
        ['facebook', 'instagram', 'twitter'].forEach(platform => {
            if (data.socialMedia[platform]) {
                data.socialMedia[platform] = data.socialMedia[platform].split('?')[0];
            }
        });
    }

    async exportToCSV(filename = 'turkish_restaurants_germany.csv') {
        // ... (CSV dışa aktarma kodunuzda bir değişiklik yapmadım, olduğu gibi kalabilir)
        const csvWriter = createCsvWriter({
            path: filename,
            header: [
                { id: 'index', title: 'Index' },
                { id: 'name', title: 'Restaurant Name' },
                { id: 'address', title: 'Address' },
                { id: 'phone', title: 'Phone' },
                { id: 'website', title: 'Website' },
                { id: 'email', title: 'Email' },
                { id: 'whatsapp', title: 'WhatsApp' },
                { id: 'rating', title: 'Rating' },
                { id: 'reviewCount', title: 'Review Count' },
                { id: 'category', title: 'Category' },
                { id: 'hours', title: 'Hours' },
                { id: 'facebook', title: 'Facebook' },
                { id: 'instagram', title: 'Instagram' },
                { id: 'twitter', title: 'Twitter' },
                { id: 'scrapedAt', title: 'Scraped At' }
            ]
        });

        const csvData = this.results.map(restaurant => ({
            ...restaurant,
            facebook: restaurant.socialMedia.facebook,
            instagram: restaurant.socialMedia.instagram,
            twitter: restaurant.socialMedia.twitter
        }));

        await csvWriter.writeRecords(csvData);
        console.log(`✓ Data exported to ${filename}`);
    }

    async exportToJSON(filename = 'turkish_restaurants_germany.json') {
       // ... (JSON dışa aktarma kodunuzda bir değişiklik yapmadım)
       await fs.writeJSON(filename, this.results, { spaces: 2 });
       console.log(`✓ Data exported to ${filename}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async run(city = 'Berlin') {
        try {
            await this.init();
            
            console.log(`\n=== Scraping ${city} ===`);
            await this.searchRestaurants(city);
            await this.page.waitForTimeout(3000);

            console.log(`\n=== Scraping completed! Found ${this.results.length} restaurants ===`);
            
            if (this.results.length > 0) {
                await this.exportToCSV(`turkish_restaurants_${city.toLowerCase()}.csv`);
                await this.exportToJSON(`turkish_restaurants_${city.toLowerCase()}.json`);
            } else {
                console.log('No data found to export');
            }
            
        } catch (error) {
            console.error('Error during scraping:', error);
        } finally {
            await this.close();
        }
    }
}

// CLI entry point: allow top-level async/await to ensure scraping completes
if (require.main === module) {
    const scraper = new RestaurantScraper();
    const city = process.argv[2];
    if (!city) {
        console.error('Usage: node scraper.js <city>');
        process.exit(1);
    }
    // Start scraping; keep process alive via Playwright browser child process
    console.log('Starting scraper for city:', city);
    // Prevent process from exiting before async operations complete
    const keepAlive = setInterval(() => {}, 1000);
    console.log('keepAlive timer scheduled');
    const runPromise = scraper.run(city);
    console.log('runPromise created');
    runPromise
      .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
      })
      .finally(() => {
        clearInterval(keepAlive);
      });
}

module.exports = RestaurantScraper;
