/*
=========================================================

navigation.js

Repository 0.8

=========================================================
*/

async function loadNavigation() {

    const response = await fetch("../data/navigation.json")
        .catch(() => fetch("data/navigation.json"));

    const navigation = await response.json();

    const container = document.getElementById("navigation");

    if (!container) return;

    let html = "";

    navigation.sections.forEach(section => {

        html += `
        <section class="navigation-section">

            <h3>${section.title}</h3>

        `;

        section.pages.forEach(page => {

            const title = page
                .replace(".html","")
                .replaceAll("-"," ");

            html += `

                <a class="navigation-link"

                   href="${page}">

                   ${title}

                </a>

            `;

        });

        html += "</section>";

    });

    container.innerHTML = html;

}