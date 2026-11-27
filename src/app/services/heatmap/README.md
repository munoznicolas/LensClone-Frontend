# Heatmap Service

The `HeatmapService` manages geolocated supermarket store prices, GPS coordinate tracking, category filters, and aggregated grocery list basket price optimization per store location.

## Public API & Signal State
- `stores`: Signal of `StoreLocation[]` populated from `GET /api/v1/stores/heatmap` (starts empty `[]`).
- `productCatalog`: Signal of `ProductPriceSample[]` (starts empty `[]`).
- `isLoading` / `loadError`: Signals tracking backend spatial heatmap request state.
- `selectedProduct`: Signal for filtering heatmap data by a specific product.
- `selectedCategory`: Signal for filtering heatmap data by category.
- `fetchSpatialHeatmap(lat, lng, radiusKm)`: Fetches live nearby store summaries from `/api/v1/stores/heatmap`.
- `calculateStoreSummaries(items: ShoppingListItem[])`: Computes basket totals, average item cost, savings percentage, and price index scores per store GPS location for a given shopping list.
