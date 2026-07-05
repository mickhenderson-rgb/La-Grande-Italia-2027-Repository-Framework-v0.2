/*
=========================================================
La Grande Italia 2027
Application Entry Point
=========================================================
*/

document.addEventListener(

    "DOMContentLoaded",

    async () => {

        await loadComponents();

        await loadApplication();

    }

);

async function loadApplication(){

    await loadTheme();

    await loadNavigation();

    await loadProjectData();

    window.destinationTemplate = await TemplateEngine.load(

    "components/destination-template.html"

);

    initialiseSearch();

    initialiseToday();

}