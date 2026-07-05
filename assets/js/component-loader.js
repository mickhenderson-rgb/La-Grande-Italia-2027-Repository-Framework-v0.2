/*
=========================================================

Component Loader

Repository 1.0.1

=========================================================
*/

async function loadComponent(id, file) {

    const target = document.getElementById(id);

    if (!target) return;

    try {

        const response = await fetch(file);

        const html = await response.text();

        target.innerHTML = html;

    }

    catch (error) {

        console.error("Unable to load component:", file);

    }

}

async function loadComponents() {

    await loadComponent(

        "header",

        "components/header.html"

    );

    await loadComponent(

        "navigation-container",

        "components/navigation.html"

    );

    await loadComponent(

        "footer",

        "components/footer.html"

    );

}