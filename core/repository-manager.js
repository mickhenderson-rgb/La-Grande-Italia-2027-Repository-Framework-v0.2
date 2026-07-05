/*
=========================================================

La Grande Italia 2027

Repository Manager

Repository 1.0.5

=========================================================
*/

const RepositoryManager = {
  data: {},

  async load(name, file) {
    try {
      const response = await fetch(file);

      if (!response.ok) {
        throw new Error(file);
      }

      this.data[name] = await response.json();

      console.log("Loaded:", name);

      return this.data[name];
    } catch (error) {
      console.error("Unable to load", file);

      return null;
    }
  },

  get(name) {
    return this.data[name];
  },

  exists(name) {
    return this.data.hasOwnProperty(name);
  },
};
