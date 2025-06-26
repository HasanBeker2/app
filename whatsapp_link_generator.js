const fs = require('fs-extra');

async function generateWhatsAppLinks(city) {
    try {
        const inputFilename = `./json_output/turkish_restaurants_${city.toLowerCase()}.json`;
        const restaurants = await fs.readJson(inputFilename);

        const updatedRestaurants = restaurants.map(restaurant => {
            let phoneNumber = restaurant.phone;
            let whatsappLink = '';

            if (phoneNumber) {
                // Remove all non-digit characters except '+'
                phoneNumber = phoneNumber.replace(/[^\d+]/g, '');

                // If it starts with '0', replace with '+49'
                if (phoneNumber.startsWith('0')) {
                    phoneNumber = '+49' + phoneNumber.substring(1);
                }
                // If it doesn't start with '+' and is a German number (assuming it's local without country code)
                else if (!phoneNumber.startsWith('+') && phoneNumber.length >= 7) { // Basic check for length
                    phoneNumber = '+49' + phoneNumber;
                }

                // Ensure it starts with '+'
                if (!phoneNumber.startsWith('+')) {
                    phoneNumber = '+' + phoneNumber;
                }

                whatsappLink = `https://wa.me/${phoneNumber.replace('+', '')}`; // WhatsApp link doesn't need the '+'
            }

            return {
                ...restaurant,
                whatsappLink: whatsappLink // Add a new field for the generated link
            };
        });

        const outputFilename = `./json_output/turkish_restaurants_${city.toLowerCase()}_with_whatsapp.json`;
        await fs.writeJson(outputFilename, updatedRestaurants, { spaces: 2 });
        console.log(`✓ WhatsApp links generated and saved to ${outputFilename}`);

    } catch (error) {
        console.error('Error generating WhatsApp links:', error);
    }
}

if (require.main === module) {
    const city = process.argv[2];
    if (!city) {
        console.error('Usage: node whatsapp_link_generator.js <city>');
        process.exit(1);
    }
    generateWhatsAppLinks(city);
}
