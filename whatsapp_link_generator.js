const fs = require('fs-extra');

async function generateWhatsAppLinks() {
    try {
        const restaurants = await fs.readJson('turkish_restaurants_germany.json');

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

        await fs.writeJson('turkish_restaurants_germany_with_whatsapp.json', updatedRestaurants, { spaces: 2 });
        console.log('✓ WhatsApp links generated and saved to turkish_restaurants_germany_with_whatsapp.json');

    } catch (error) {
        console.error('Error generating WhatsApp links:', error);
    }
}

generateWhatsAppLinks();
