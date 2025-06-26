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
            await this.page.goto(validUrl.href, { waitUntil: 'networkidle', timeout: 30000 });

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
                    await this.page.goto(contactUrl, { waitUntil: 'networkidle', timeout: 15000 });
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
                    console.log(`Could not navigate to or find Instagram on ${contactUrl}: ${e.message}`);
                }
            }

            return '';

        } catch (error) {
            console.error(`Error visiting ${url}: ${error.message}`);
            return '';
        }
    }

    async run() {
        await this.init();
        let restaurants = [];
        try {
            restaurants = await fs.readJson('turkish_restaurants_germany_with_whatsapp.json');
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
            await this.page.waitForTimeout(1000); // Be respectful
        }

        await fs.writeJson('turkish_restaurants_germany_final.json', updatedRestaurants, { spaces: 2 });
        console.log('✓ Updated restaurant data with Instagram links saved to turkish_restaurants_germany_final.json');

        await this.close();
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

if (require.main === module) {
    const scraper = new InstagramScraper();
    scraper.run();
}
