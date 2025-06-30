const { chromium } = require('playwright');
const fs = require('fs-extra');

class InstagramScraper {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await chromium.launch({
            headless: true,
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

    async findInstagramLink(url) {
        try {
            let validUrl;
            try {
                validUrl = new URL(url);
            } catch (e) {
                console.log(`Invalid URL, skipping: ${url}`);
                return '';
            }

            console.log(`Visiting: ${validUrl.href}`);
            await this.page.goto(validUrl.href, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Look for Instagram links in the page
            const instagramLink = await this.page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const instagramLinks = links.filter(link => {
                    const href = link.href;
                    return href.includes('instagram.com') && !href.includes('share');
                });
                return instagramLinks.length > 0 ? instagramLinks[0].href : '';
            });

            if (instagramLink) {
                console.log(`Found Instagram link: ${instagramLink}`);
                return instagramLink;
            }

            // If not found on main page, try common contact/about pages
            const commonPaths = ['/contact', '/about', '/impressum', '/kontakt', '/ueber-uns'];
            for (const path of commonPaths) {
                const contactUrl = new URL(path, url).href;
                console.log(`Trying contact page: ${contactUrl}`);
                try {
                    await this.page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    const contactPageInstagramLink = await this.page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const instagramLinks = links.filter(link => {
                            const href = link.href;
                            return href.includes('instagram.com') && !href.includes('share');
                        });
                        return instagramLinks.length > 0 ? instagramLinks[0].href : '';
                    });
                    if (contactPageInstagramLink) {
                        console.log(`Found Instagram link on contact page: ${contactPageInstagramLink}`);
                        return contactPageInstagramLink;
                    }
                } catch (e) {
                    // Silently skip failed contact pages
                }
            }

            return '';

        } catch (error) {
            console.log(`Skipping ${url}: ${error.message}`);
            return '';
        }
    }

    async run(city) {
        await this.init();
        let restaurants = [];
        try {
            const inputFilename = `./json_output/turkish_restaurants_${city.toLowerCase()}_with_whatsapp.json`;
            restaurants = await fs.readJson(inputFilename);
        } catch (error) {
            console.error('Error reading input JSON file:', error);
            await this.close();
            return;
        }

        const updatedRestaurants = [];
        for (const restaurant of restaurants) {
            let instagram = restaurant.socialMedia.instagram || '';

            if (!instagram && restaurant.website) {
                instagram = await this.findInstagramLink(restaurant.website);
            }

            updatedRestaurants.push({
                ...restaurant,
                socialMedia: {
                    ...restaurant.socialMedia,
                    instagram: instagram
                }
            });
            await this.page.waitForTimeout(500); // Be respectful
        }

        const outputJsonFilename = `./json_output/turkish_restaurants_${city.toLowerCase()}_final.json`;
        await fs.writeJson(outputJsonFilename, updatedRestaurants, { spaces: 2 });
        console.log(`✓ Updated restaurant data with Instagram links saved to ${outputJsonFilename}`);

        await this.exportFinalCSV(updatedRestaurants, city);

        await this.close();
    }

    async exportFinalCSV(data, city) {
        const dir = './csv_output';
        await fs.ensureDir(dir);
        const filename = `${dir}/turkish_restaurants_${city.toLowerCase()}_final.csv`;

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
                { id: 'whatsappLink', title: 'WhatsApp Link' },
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

        const csvData = data.map(restaurant => ({
            ...restaurant,
            facebook: restaurant.socialMedia.facebook,
            instagram: restaurant.socialMedia.instagram,
            twitter: restaurant.socialMedia.twitter
        }));

        await csvWriter.writeRecords(csvData);
        console.log(`✓ Final data exported to ${filename}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

if (require.main === module) {
    const scraper = new InstagramScraper();
    const city = process.argv[2];
    if (!city) {
        console.error('Usage: node instagram_scraper.js <city>');
        process.exit(1);
    }
    scraper.run(city);
}

module.exports = InstagramScraper;
