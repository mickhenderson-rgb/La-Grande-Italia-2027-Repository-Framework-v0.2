/*
=========================================================
Search
=========================================================
*/

function initialiseSearch(){

    const input=document.getElementById("search");

    if(!input) return;

    input.addEventListener("keyup",searchGuide);

}

function searchGuide(){

    const value=document.getElementById("search").value.toLowerCase();

    console.log("Searching",value);

}