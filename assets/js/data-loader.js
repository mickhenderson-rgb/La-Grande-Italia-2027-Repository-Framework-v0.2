/*
=========================================================
JSON Loader
=========================================================
*/

async function loadJSON(file){

    try{

        const response = await fetch(file);

        if(!response.ok){

            throw new Error(file);

        }

        return await response.json();

    }

    catch(error){

        console.error("Unable to load",file,error);

        return null;

    }

}

async function loadProjectData(){

    window.tripData = await loadJSON("data/trip.json");

    window.itinerary = await loadJSON("data/itinerary.json");

    window.bookings = await loadJSON("data/bookings.json");

    window.budget = await loadJSON("data/budget.json");

    window.activities = await loadJSON("data/activities.json");

    window.navigation = await loadJSON("data/navigation.json");

    window.destinations = await loadJSON("data/destinations.json");

}