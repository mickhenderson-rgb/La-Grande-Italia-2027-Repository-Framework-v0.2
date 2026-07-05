/*
=========================================================

Template Engine

Repository 1.0.2

=========================================================
*/

class TemplateEngine {

    static async load(file){

        const response = await fetch(file);

        return await response.text();

    }

    static render(template,data){

        let html = template;

        Object.keys(data).forEach(key=>{

            html = html.replaceAll(

                "{{"+key+"}}",

                data[key]

            );

        });

        return html;

    }

}