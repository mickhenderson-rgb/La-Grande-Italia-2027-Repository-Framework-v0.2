/*
=========================================================
Utilities
=========================================================
*/

function formatCurrency(value){

    return new Intl.NumberFormat(

        "en-AU",

        {

            style:"currency",

            currency:"AUD"

        }

    ).format(value);

}

function formatDate(date){

    return new Intl.DateTimeFormat(

        "en-AU"

    ).format(date);

}