/*
=========================================================
Theme Manager
=========================================================
*/

async function loadTheme(){

    const theme = localStorage.getItem("theme") || "light";

    document.documentElement.setAttribute("data-theme",theme);

}

function toggleTheme(){

    const current = document.documentElement.getAttribute("data-theme");

    const next = current==="light" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme",next);

    localStorage.setItem("theme",next);

}