/*
=========================================================

COMPASS-TOS

Layout Manager

Version 1.0.0

=========================================================
*/

const Layout = {
  render(content) {
    return `

<div class="app-layout">

    ${Sidebar.render()}

    <main class="app-main">

        <header class="app-header">

            <div class="app-title">

                La Grande Italia 2027

            </div>

            <div class="app-actions">

                <button id="themeButton">

                    🌙 Theme

                </button>

            </div>

        </header>

        <section class="app-content">

            ${content}

        </section>

        <footer class="app-footer">

            Ready

        </footer>

    </main>

</div>

`;
  },
};
