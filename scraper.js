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
            headless: false,
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
            await this.page.waitForSelector('[role="feed"]', { timeout: 15000 });
        } catch (error) {
            console.log('Feed selector not found, trying alternative...');
            await this.page.waitForSelector('div[role="main"]', { timeout: 10000 });
        }
        
        await this.page.waitForTimeout(5000);
        await this.scrollAndLoadResults();
        
        const restaurantElements = await this.page.$$('div[role="feed"] a[href*="/place/"], div[role="feed"] div[data-result-index] a');
        console.log(`Found ${restaurantElements.length} restaurants`);
        
        for (let i = 0; i < Math.min(restaurantElements.length, 10); i++) {
            try {
                await this.extractRestaurantData(restaurantElements[i], i);
                const delay = Math.random() * 2000 + 2000;
                await this.page.waitForTimeout(delay);
            } catch (error) {
                console.log(`Error processing restaurant ${i}: ${error.message}`);
            }
        }
    }

    async scrollAndLoadResults() {
        const feedSelector = '[role="feed"]';
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10;

        while (scrollAttempts < maxScrollAttempts) {
            await this.page.evaluate((selector) => {
                const feed = document.querySelector(selector);
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
            }, feedSelector);

            await this.page.waitForTimeout(2000);

            const currentHeight = await this.page.evaluate((selector) => {
                const feed = document.querySelector(selector);
                return feed ? feed.scrollHeight : 0;
            }, feedSelector);

            if (currentHeight === previousHeight) {
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
            }

            previousHeight = currentHeight;
        }
    }

    async extractRestaurantData(element, index) {
        try {
            console.log(`Processing restaurant ${index}...`);
            
            const linkHref = await element.getAttribute('href');
            if (linkHref && linkHref.includes('/place/')) {
                await element.click();
                await this.page.waitForTimeout(4000);
            } else {
                await this.page.evaluate((el) => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, element);
                await this.page.waitForTimeout(1000);
                
                try {
                    await element.click({ timeout: 5000 });
                    await this.page.waitForTimeout(4000);
                } catch (clickError) {
                    console.log(`Click failed for restaurant ${index}, trying force click...`);
                    await this.page.evaluate((el) => el.click(), element);
                    await this.page.waitForTimeout(4000);
                }
            }
            
            const restaurantData = await this.page.evaluate(() => {
                const data = {
                    name: '',
                    address: '',
                    phone: '',
                    website: '',
                    rating: '',
                    reviewCount: '',
                    hours: '',
                    priceLevel: '',
                    category: '',
                    whatsapp: '',
                    email: '',
                    socialMedia: {
                        facebook: '',
                        instagram: '',
                        twitter: ''
                    }
                };

                let nameElement = document.querySelector('h1[data-attrid="title"]');
                if (!nameElement) nameElement = document.querySelector('[role="main"] h1');
                if (!nameElement) nameElement = document.querySelector('.DUwDvf.lfPIob');
                if (!nameElement) nameElement = document.querySelector('.x3AX1-LfntMc-header-title-title');
                if (!nameElement) nameElement = document.querySelector('h1');
                if (!nameElement) nameElement = document.querySelector('.fontHeadlineSmall');
                
                if (nameElement && nameElement.textContent) {
                    data.name = nameElement.textContent.trim();
                }

                let addressElement = document.querySelector('button[data-item-id="address"]');
                if (!addressElement) addressElement = document.querySelector('[data-item-id="address"]');
                if (!addressElement) addressElement = document.querySelector('.Io6YTe.fontBodyMedium');
                if (!addressElement) addressElement = document.querySelector('[aria-label*="Address"]');
                if (!addressElement) addressElement = document.querySelector('[data-value="Address"]');
                
                if (addressElement && addressElement.textContent) {
                    data.address = addressElement.textContent.trim();
                }

                let phoneElement = document.querySelector('button[data-item-id="phone"]');
                if (!phoneElement) phoneElement = document.querySelector('[data-item-id="phone"]');
                if (!phoneElement) phoneElement = document.querySelector('a[href^="tel:"]');
                if (!phoneElement) phoneElement = document.querySelector('button[aria-label*="Call"]');
                
                if (phoneElement) {
                    if (phoneElement.href && phoneElement.href.startsWith('tel:')) {
                        data.phone = phoneElement.href.replace('tel:', '');
                    } else if (phoneElement.textContent) {
                        data.phone = phoneElement.textContent.trim();
                    }
                }

                const websiteElement = document.querySelector('[data-value="Web sitesi"]') ||
                                     document.querySelector('a[aria-label*="Web sitesi"]') ||
                                     document.querySelector('[data-item-id="authority"]') ||
                                     document.querySelector('a[data-item-id="authority"]');
                if (websiteElement) data.website = websiteElement.href || websiteElement.textContent.trim();

                let ratingElement = document.querySelector('.MW4etd');
                if (!ratingElement) ratingElement = document.querySelector('span[aria-label*="star"]');
                if (!ratingElement) ratingElement = document.querySelector('.fontDisplayLarge');
                
                if (ratingElement && ratingElement.textContent) {
                    data.rating = ratingElement.textContent.trim();
                }

                const reviewElement = document.querySelector('[aria-label*="inceleme"]');
                if (reviewElement) data.reviewCount = reviewElement.textContent.trim();

                const hoursElement = document.querySelector('[data-value="Saatler"]') ||
                                   document.querySelector('[aria-label*="Saatler"]');
                if (hoursElement) data.hours = hoursElement.textContent.trim();

                const categoryElement = document.querySelector('[data-value="Kategori"]') ||
                                      document.querySelector('button[jsaction*="category"]');
                if (categoryElement) data.category = categoryElement.textContent.trim();

                document.querySelectorAll('a[href*="whatsapp"]').forEach(link => {
                    data.whatsapp = link.href;
                });

                document.querySelectorAll('a[href*="mailto"]').forEach(link => {
                    data.email = link.href.replace('mailto:', '');
                });

                document.querySelectorAll('a[href*="facebook"]').forEach(link => {
                    data.socialMedia.facebook = link.href;
                });

                document.querySelectorAll('a[href*="instagram"]').forEach(link => {
                    data.socialMedia.instagram = link.href;
                });

                document.querySelectorAll('a[href*="twitter"]').forEach(link => {
                    data.socialMedia.twitter = link.href;
                });

                const popupHtml = document.querySelector('div[role="dialog"]')?.innerHTML ?? '';
                data.popupHtml = popupHtml;

                return data;
            });

            if (restaurantData.name && restaurantData.name !== 'Ergebnisse' && restaurantData.name.length > 2) {
                restaurantData.index = index + 1;
                restaurantData.scrapedAt = new Date().toISOString();
                
                this.normalizeData(restaurantData);
                this.results.push(restaurantData);
                console.log(`✓ Scraped: ${restaurantData.name}`);
            } else {
                console.log(`✗ Skipped invalid data: ${restaurantData.name || 'No name'}`);
            }

        } catch (error) {
            console.log(`Error extracting data for restaurant ${index}: ${error.message}`);
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
            data.website = 'https://' + data.website;
        }
        
        if (data.rating) {
            const ratingMatch = data.rating.match(/[\d,.]*/);
            data.rating = ratingMatch ? ratingMatch[0].replace(',', '.') : '';
        }
        
        ['facebook', 'instagram', 'twitter'].forEach(platform => {
            if (data.socialMedia[platform]) {
                data.socialMedia[platform] = data.socialMedia[platform].split('?')[0];
            }
        });
        
        delete data.popupHtml;
    }

    async exportToCSV(filename = 'turkish_restaurants_germany.csv') {
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
        await fs.writeJSON(filename, this.results, { spaces: 2 });
        console.log(`✓ Data exported to ${filename}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async run(cities = ['Berlin']) {
        try {
            await this.init();
            
            for (const city of cities) {
                console.log(`\n=== Scraping ${city} ===`);
                await this.searchRestaurants(city);
                await this.page.waitForTimeout(3000);
            }

            console.log(`\n=== Scraping completed! Found ${this.results.length} restaurants ===`);
            
            if (this.results.length > 0) {
                await this.exportToCSV();
                await this.exportToJSON();
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

if (require.main === module) {
    const scraper = new RestaurantScraper();
    
    const cities = process.argv.slice(2);
    if (cities.length === 0) {
        console.log('Usage: node scraper.js [city1] [city2] ...');
        console.log('Example: node scraper.js Berlin München Hamburg');
        console.log('Default cities will be used if none specified.');
    }
    
    scraper.run(cities.length > 0 ? cities : undefined);
}

module.exports = RestaurantScraper;