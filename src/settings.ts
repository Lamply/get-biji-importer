import {App, PluginSettingTab, Setting} from "obsidian";
import GetBijiImporterPlugin from "./main";

export interface GetBijiImporterPluginSettings {
	GetBijiSetting: string;
}

export const DEFAULT_SETTINGS: GetBijiImporterPluginSettings = {
	GetBijiSetting: 'default'
}

export class GetBijiImporterSettingTab extends PluginSettingTab {
	plugin: GetBijiImporterPlugin;

	constructor(app: App, plugin: GetBijiImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('输出文件夹')
			.setDesc('Folder in your vault where files will be saved.')
			.addText(text => text
				.setPlaceholder('Downloaded notes')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}
