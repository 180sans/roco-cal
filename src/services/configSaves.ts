import { desktopApi } from "./desktopApi";
import { createConfigSaver } from "./configSaveQueue";

export const saveConfigPatch = createConfigSaver(desktopApi.savePickerConfig);
