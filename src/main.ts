import { App, Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl } from 'obsidian';
import * as JSZip from 'jszip';
import TurndownService from 'turndown';

// 1. Define Plugin Settings
interface GetBijiImporterPluginSettings {
	outputFolder: string;
}

const DEFAULT_SETTINGS: GetBijiImporterPluginSettings = {
	outputFolder: 'get'
}

export default class GetBijiImporterPlugin extends Plugin {
	settings: GetBijiImporterPluginSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon (button on the left sidebar)
		const ribbonIconEl = this.addRibbonIcon('download', 'Get笔记导入', (evt: MouseEvent) => {
 			new DownloadModal(this.app, this).open();
 		});
		ribbonIconEl.addClass('download-ribbon-button');

		// Add a command to open the download modal
		this.addCommand({
			id: 'download-and-convert-notes',
			name: '下载并转换笔记',
			callback: () => {
				new DownloadModal(this.app, this).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new GetBijiImporterSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<GetBijiImporterPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 2. Core Processing Logic
	async processNotes(url: string) {
		try {
			new Notice("下载zip文件...");
			
			// Download the zip file
			const response = await requestUrl({
				url: url,
				method: "GET",
			});

			if (response.status !== 200) {
				throw new Error(`Download failed with status ${response.status}`);
			}

			new Notice("正在处理笔记...");
			
			// Load the zip buffer
			const zip = await JSZip.loadAsync(response.arrayBuffer);
			
			// Setup Markdown converter
			const turndownService = new TurndownService({ headingStyle: 'atx' });
			const parser = new DOMParser();
			
			let successCount = 0;

			// Ensure output folder exists
			const folderPath = this.settings.outputFolder;
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await this.app.vault.createFolder(folderPath);
			}

			// Iterate through files in the zip
			for (const [filename, fileData] of Object.entries(zip.files)) {
				// Only process HTML files inside 'notes/' (mimicking your bash script)
				if (!fileData.dir && filename.includes('notes/') && filename.endsWith('.html')) {
					
					const htmlContent = await fileData.async("string");
					const doc = parser.parseFromString(htmlContent, "text/html");
					
					const noteDiv = doc.querySelector('.note');
					if (!noteDiv) continue; // Skip if no note container

					// Extract Title
					const titleTag = noteDiv.querySelector('h1');
					const title = titleTag ? titleTag.textContent?.trim() : "无标题";

					// Extract Creation Time
					let creationTime = "未知时间";
					const pTags = noteDiv.querySelectorAll('p');
					pTags.forEach(p => {
						const text = p.textContent?.trim() || "";
						if (text.startsWith('创建于：')) {
							creationTime = text.replace('创建于：', '').trim();
						}
					});

					// Extract Tags
					const tags: string[] = [];
					const spanTags = noteDiv.querySelectorAll('span.tag');
					spanTags.forEach(span => {
						if (span.textContent) tags.push(span.textContent.trim());
					});

					// Handle the Audio element text removal (mimicking your python split behavior)
					let markdownBody = turndownService.turndown(htmlContent);
					const audioSplitter = "您的浏览器不支持 audio 元素。";
					if (markdownBody.includes(audioSplitter)) {
						markdownBody = markdownBody.split(audioSplitter).slice(1).join(audioSplitter).trim();
					} else {
						const hrSplitter = "\n* * *\n";
						if (markdownBody.includes(hrSplitter)) {
							markdownBody = markdownBody.split(hrSplitter).slice(1).join(hrSplitter).trim();
						}
					}
					markdownBody = markdownBody.replace("document.addEventListener('DOMContentLoaded', initDetailPage);", "").trim();

					// Format Frontmatter
					const datePart = creationTime.split(' ')[0] || "";
					const tagsFormatted = tags.length > 0 ? `\n${tags.map(t => `- ${t}`).join('\n')}` : "";
					const finalMarkdown = `---\n` +
						`title: "${title}"\n` +
						`date: ${datePart}\n` +
						`tags: \n${tagsFormatted}\n` +
						`---\n` +
						`${markdownBody}`;

					// Safe filename generation
					const safeTitle = (title || "Unnamed").replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '-');
					const filePath = `${folderPath}/${safeTitle}.md`;

					// Save to Obsidian Vault
					const existingFile = this.app.vault.getAbstractFileByPath(filePath);
					if (!existingFile) {
						await this.app.vault.create(filePath, finalMarkdown);
						successCount++;
					}
				}
			}

			new Notice(`成功处理 ${successCount} 个新笔记！`);

		} catch (error: unknown) {
			console.error(error);
			new Notice(`处理笔记时出错: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

// 3. Modal for User Input
class DownloadModal extends Modal {
	plugin: GetBijiImporterPlugin;
	urlInput: string;

	constructor(app: App, plugin: GetBijiImporterPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl("h2", { text: "下载笔记" });

		const inputWrapper = contentEl.createDiv();
		const inputElement = inputWrapper.createEl("input", {
			type: "text",
			placeholder: "在这里输入URL...",
		});
		inputElement.setCssProps({ width: "100%", marginBottom: "1em" });

		inputElement.addEventListener("input", (e) => {
			this.urlInput = (e.target as HTMLInputElement).value;
		});

		const submitBtn = contentEl.createEl("button", { text: "下载并转换" });
		submitBtn.addEventListener("click", () => {
			if (this.urlInput) {
				void this.plugin.processNotes(this.urlInput);
				this.close();
			} else {
				new Notice("Please enter a valid URL.");
			}
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

// 4. Settings Tab
class GetBijiImporterSettingTab extends PluginSettingTab {
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
			.setDesc('保存路径，在你的Obsidian库中，文件将被保存在这个文件夹下。')
			.addText(text => text
				.setPlaceholder('Downloaded notes')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}