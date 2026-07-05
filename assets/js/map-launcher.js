/*
=========================================================
La Grande Italia 2027

map-launcher.js

Version 1.0.0

Repository 0.8
=========================================================
*/

const Navigation = {

    providers: {

        google(lat, lng) {

            return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

        },

        waze(lat, lng) {

            return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;

        },

        apple(lat, lng) {

            return `https://maps.apple.com/?ll=${lat},${lng}`;

        },

        osm(lat, lng) {

            return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}`;

        }

    },

    open(provider, lat, lng) {

        const fn = this.providers[provider];

        if (!fn) {

            console.error("Unknown navigation provider");

            return;

        }

        window.open(fn(lat, lng), "_blank");

    }

};