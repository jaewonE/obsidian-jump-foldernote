import * as fs from "fs";
import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

interface FindProjectNoteSetting {
	HocTag: string;
	MocTag: string;
}

const DEFAULT_SETTINGS: FindProjectNoteSetting = {
	HocTag: "HOC",
	MocTag: "MOC",
};

enum TagType {
	HOC,
	MOC,
}

export default class FindProjectNotePlugin extends Plugin {
	settings: FindProjectNoteSetting;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "open-project-note",
			name: "Open project note",
			callback: () => this.openFindingNote(TagType.HOC),
		});
		this.addCommand({
			id: "open-moc-note",
			name: "Open map of content note",
			callback: () => this.openFindingNote(TagType.MOC),
		});
		this.addSettingTab(new FindProjectNoteSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openFindingNote(type: TagType) {
		const activeFile = this.app.workspace.getActiveFile();
		let curFileHasType = false;
		if (!activeFile) {
			return; // 활성 파일이 없는 경우 종료
		}

		const pathParts = activeFile.path.split("/");

		// @ts-ignore
		const __dirname = this.app.vault.adapter.basePath;

		for (let i = pathParts.length - 1; i >= 0; i--) {
			const filename = `${pathParts[i - 1]}.md`;
			const projectNote =
				pathParts.slice(0, i).join("/") + `/${filename}`;
			const projectNotePath = `${__dirname}/${projectNote}`;
			// new Notice(`projectNote: ${projectNotePath} exist: ${fs.existsSync(projectNotePath)}`,5000);

			if (fs.existsSync(projectNotePath)) {
				const isFolderNote = await this.checkForTag(
					projectNotePath,
					type
				);
				// new Notice(`isFolderNote: ${isFolderNote}`, 5000);

				if (
					pathParts.length - 1 === i &&
					filename === pathParts[pathParts.length - 1] &&
					isFolderNote
				) {
					// new Notice(`Current file is project note: ${projectNote}`,5000);
					curFileHasType = true;
					continue;
				}

				if (isFolderNote) {
					// new Notice(`Opening project note: ${projectNote}`, 5000);
					this.app.workspace.openLinkText(projectNote, "/", false);
					return;
				}
			}
		}

		if (!curFileHasType) {
			const readmePath = `${__dirname}/README.md`;
			if (fs.existsSync(readmePath)) {
				this.app.workspace.openLinkText(readmePath, "/", false);
			} else {
				new Notice(
					`Project note with ${this.settings.HocTag} tag not found in the tags property.`,
					3000
				);
			}
		}
	}

	async checkForTag(filePath: string, type: TagType): Promise<boolean> {
		try {
			const fileContent = await fs.promises.readFile(filePath, "utf-8");
			// 파일 내용에서 첫 번째 "---"로 시작하는 블록을 찾음
			const frontMatterBlock = fileContent.match(/^---\n([\s\S]*?)\n---/);
			if (!frontMatterBlock) {
				return false;
			}

			if (frontMatterBlock) {
				// YAML 형태의 문자열에서 "tags:" 이후의 내용을 추출
				const tagsMatch =
					frontMatterBlock[1].match(/tags:\n(.*?)\n(?=\w)/s);
				if (tagsMatch) {
					// "tags" 섹션에서 각 태그를 배열로 변환
					const tags = tagsMatch[1]
						.split("\n")
						.map((tag) => tag.trim().replace(/^- /, ""));
					// new Notice(`tags: ${tags}`, 5000);

					switch (type) {
						case TagType.HOC:
							return tags.includes(this.settings.HocTag);
						case TagType.MOC:
							return tags.includes(this.settings.MocTag);
						default:
							return false;
					}
				}
			}
		} catch (error) {
			console.error(`Error reading file: ${error}`);
		}
		return false;
	}
}

class FindProjectNoteSettingTab extends PluginSettingTab {
	private readonly plugin: FindProjectNotePlugin;

	constructor(app: App, plugin: FindProjectNotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Find project Note" });

		new Setting(containerEl)
			.setName("Project Note Tag")
			.setDesc("The tag to search for in the project note.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your tag without #")
					.setValue(this.plugin.settings.HocTag)
					.onChange(async (value) => {
						this.plugin.settings.HocTag = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Map of content Note Tag")
			.setDesc("The tag to search for map of content note.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your tag without #")
					.setValue(this.plugin.settings.MocTag)
					.onChange(async (value) => {
						this.plugin.settings.MocTag = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
