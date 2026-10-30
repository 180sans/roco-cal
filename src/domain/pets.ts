import { type Pet, type PresetItem } from "../services/desktopTypes";

function petMatchesPickerFilters(pet: Pet, elements: string[], finalOnly: boolean) {
  return elements.every((element) => pet.elements.includes(element)) && (!finalOnly || pet.isFinal);
}

function buildPetLookup(pets: Pet[]) {
  const lookup = new Map<string, Pet>();
  pets.forEach((pet) => {
    [pet.label, `${pet.id}${pet.name}`, pet.name].forEach((key) => {
      if (key && !lookup.has(key)) lookup.set(key, pet);
    });
  });
  return lookup;
}

function petFromPreset(preset: PresetItem, lookup: Map<string, Pet>) {
  return lookup.get(`${preset.id}${preset.name}`) || lookup.get(preset.key) || lookup.get(preset.name);
}

export { buildPetLookup, petFromPreset, petMatchesPickerFilters };
