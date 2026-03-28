import type { DonorListing, RecipientNode, VolunteerNode } from "../types/logistics";

export const donorListings: DonorListing[] = [
  {
    id: "d-1",
    foodType: "cooked",
    category: "balanced-meals",
    quantityKg: 18,
    expiresInMinutes: 95,
    prepTime: "11:30",
    donorReliability: 0.91,
    location: { lat: 12.9738, lng: 77.5945, label: "Central Kitchen" },
  },
  {
    id: "d-2",
    foodType: "packaged",
    category: "high-carb",
    quantityKg: 10,
    expiresInMinutes: 230,
    prepTime: "10:20",
    donorReliability: 0.85,
    location: { lat: 12.9963, lng: 77.6033, label: "Hostel Block A" },
  },
  {
    id: "d-3",
    foodType: "cooked",
    category: "protein-rich",
    quantityKg: 8,
    expiresInMinutes: 70,
    prepTime: "12:10",
    donorReliability: 0.96,
    location: { lat: 12.9611, lng: 77.6387, label: "Restaurant District" },
  },
];

export const recipients: RecipientNode[] = [
  {
    id: "r-1",
    name: "Hope Shelter",
    location: { lat: 12.9491, lng: 77.5735, label: "Hope Shelter" },
    capacityMeals: 120,
    acceptedFoodTypes: ["cooked", "packaged"],
    acceptedCategories: ["balanced-meals", "protein-rich"],
    refrigeration: true,
    openNow: true,
  },
  {
    id: "r-2",
    name: "Community Hub East",
    location: { lat: 12.9891, lng: 77.6368, label: "Community Hub East" },
    capacityMeals: 80,
    acceptedFoodTypes: ["packaged"],
    acceptedCategories: ["high-carb", "balanced-meals"],
    refrigeration: false,
    openNow: true,
  },
  {
    id: "r-3",
    name: "Children Nutrition Center",
    location: { lat: 12.9722, lng: 77.5488, label: "Children Nutrition Center" },
    capacityMeals: 60,
    acceptedFoodTypes: ["cooked"],
    acceptedCategories: ["protein-rich", "balanced-meals"],
    refrigeration: true,
    openNow: true,
  },
];

export const volunteers: VolunteerNode[] = [
  {
    id: "v-1",
    name: "Asha",
    location: { lat: 12.9778, lng: 77.5802, label: "Volunteer Asha" },
    vehicleType: "scooter",
    capacityKg: 20,
    reliability: 0.93,
    available: true,
  },
  {
    id: "v-2",
    name: "Rahul",
    location: { lat: 12.9588, lng: 77.6205, label: "Volunteer Rahul" },
    vehicleType: "bike",
    capacityKg: 10,
    reliability: 0.88,
    available: true,
  },
  {
    id: "v-3",
    name: "Zoya",
    location: { lat: 12.9944, lng: 77.6021, label: "Volunteer Zoya" },
    vehicleType: "van",
    capacityKg: 40,
    reliability: 0.9,
    available: true,
  },
];
