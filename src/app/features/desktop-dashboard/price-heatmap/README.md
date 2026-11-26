# Price Heatmap Component

The `PriceHeatmapComponent` visualizes geolocated supermarket prices associated directly with exact GPS coordinates (`latitude`, `longitude`) using an interactive Leaflet map and store location breakdown cards.

## Features
- **Grocery List Optimizer Mode**: Integrates with `ShoppingListService` to calculate total list basket cost across monitored supermarket GPS locations and highlights the cheapest store location for your list.
- **Product Filter Mode**: Visualizes price distribution across store GPS markers for specific scanned or catalog products.
- **Category Aggregation Mode**: Aggregates average item price index by product category across store locations.
- **Interactive Supermarket GPS Map**: Interactive store pins displayed at exact GPS coordinates with popups showing address, coordinates, and basket savings.
- **Reactive Localization**: Integrates with `I18nService` so headers, category/product labels, number formatting, and Leaflet tooltips/popups update immediately when the active locale changes.
