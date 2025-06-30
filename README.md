# Turkish Restaurant Scraper for Germany

Google Maps scraper to collect Turkish restaurant information in German cities.

## Features

- Scrapes restaurant data from Google Maps
- Extracts: name, address, phone, website, email, WhatsApp, social media links
- Exports data to CSV and JSON formats
- Supports multiple cities

## Installation

```bash
npm install
```

## Usage

### Full Pipeline (Recommended)
```bash
node run_all.js Berlin München Hamburg
```
This runs the complete pipeline for each city:
1. Scrapes restaurant data
2. Generates WhatsApp links
3. Scrapes Instagram links

### Basic Usage
```bash
npm start
```
This will scrape default cities: Berlin, München, Hamburg, Köln, Frankfurt

### Custom Cities
```bash
node scraper.js Berlin München
node scraper.js Stuttgart Düsseldorf
```

### Single City
```bash
node scraper.js Berlin
```

## Output Files

- `turkish_restaurants_germany.csv` - CSV format
- `turkish_restaurants_germany.json` - JSON format

## Data Fields

- Restaurant Name
- Address
- Phone Number
- Website
- Email
- WhatsApp Business
- Social Media (Facebook, Instagram, Twitter)
- Rating & Review Count
- Category
- Operating Hours
- Scrape Timestamp

## Requirements

- Node.js 14+
- Internet connection
- Playwright will install Chromium automatically

## Notes

- The scraper runs in non-headless mode to avoid detection
- Includes delays between requests to be respectful
- Results may vary based on Google Maps availability
- Some fields may be empty if not available on the restaurant's listing