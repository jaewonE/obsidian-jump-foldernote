import * as fs from "fs";
import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

interface FindProjectNoteSetting {
	HocTag: string;
	MocTag: string;
	forceReadingViewTags: string[];
	debounceTimeout: number;
	fleetingNoteFolderName: string;
}

const DEFAULT_SETTINGS: FindProjectNoteSetting = {
	HocTag: "HOC",
	MocTag: "MOC",
	forceReadingViewTags: ["HOC", "MOC"],
	debounceTimeout: 300,
	fleetingNoteFolderName: "00.Fleeting",
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

		this.registerEvent(
			this.app.workspace.on("file-open", async (file: TFile) => {
				const leaf = this.app.workspace.getLeaf(false);
				const tfile = this.app.workspace.getActiveFile();
				if (leaf && tfile) {
					await this.forceReadingView(leaf);
					await leaf.openFile(tfile, { active: true });
					// new Notice(`tfile path: ${tfile.path}`, 5000);
				}
			})
		);
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

	async checkForContainingTags(
		view: MarkdownView,
		allowTags: string[]
	): Promise<boolean> {
		try {
			const fileContent = view.editor.getValue();
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
					// 태그 중 하나라도 allowTags 배열에 포함되어 있으면 true 반환
					if (tags.some((tag) => allowTags.includes(tag))) {
						return true;
					}
				}
			}
			return false;
		} catch (error) {
			console.error(`Error reading file: ${error}`);
		}
		return false;
	}

	forceReadingView = async (leaf: WorkspaceLeaf): Promise<boolean> => {
		const view = leaf.view instanceof MarkdownView ? leaf.view : null;
		if (view) {
			const containTags = await this.checkForContainingTags(
				view,
				this.settings.forceReadingViewTags
			);
			// new Notice(`containTags: ${containTags}`, 5000);

			// reading view 일때 mode: preview / soruce: false
			// editing view 일때 mode: source / source: false
			const state = leaf.getViewState();
			state.state["mode"] = containTags ? "preview" : "source";
			// new Notice(`state: ${state.state["mode"]}`, 5000);
			await leaf.setViewState(state);
			return containTags;
		}
		return false;
	};

	async openFindingNote(type: TagType) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return; // 활성 파일이 없는 경우 종료
		}

		// @ts-ignore
		const __dirname = this.app.vault.adapter.basePath;
		const pathParts = activeFile.path.split("/");
		const pathPartsLastIndex = pathParts.length - 1;
		// new Notice(`pathParts: ${pathParts}`, 5000);

		for (let i = pathPartsLastIndex; i >= 0; i--) {
			if (i === 0) {
				break;
			}
			const filename = `${pathParts[i - 1]}.md`;
			const projectNote =
				pathParts.slice(0, i).join("/") + `/${filename}`;
			const projectNotePath = `${__dirname}/${projectNote}`;
			// new Notice(`projectNote: ${projectNotePath} exist: ${fs.existsSync(projectNotePath)}`,5000);

			if (fs.existsSync(projectNotePath)) {
				const isFolderNote = await this.checkForTypeTag(
					projectNotePath,
					type
				);
				// new Notice(`isFolderNote: ${isFolderNote}`, 5000);

				if (
					pathPartsLastIndex === i &&
					filename === pathParts[pathPartsLastIndex] &&
					isFolderNote
				) {
					// new Notice(`Current file is project note: ${projectNote}`,5000);
					continue;
				}

				if (isFolderNote) {
					// new Notice(`Opening project note: ${projectNote}`, 5000);
					this.app.workspace.openLinkText(projectNote, "/", false);
					return;
				}
			}
		}

		await this.goReadme(__dirname, type);
	}

	async goReadme(dirname: string, type: TagType = TagType.HOC) {
		if (fs.existsSync(`${dirname}/README.md`)) {
			this.app.workspace.openLinkText("README.md", "/", false);
		} else {
			new Notice(
				`Project note with ${type} tag not found in the tags property.`,
				3000
			);
		}
	}

	async getTags(filePath: string): Promise<string[]> {
		try {
			const fileContent = await fs.promises.readFile(filePath, "utf-8");
			// 파일 내용에서 첫 번째 "---"로 시작하는 블록을 찾음
			const frontMatterBlock = fileContent.match(/^---\n([\s\S]*?)\n---/);
			if (!frontMatterBlock) {
				return [];
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

					return tags;
				}
			}
		} catch (error) {
			console.error(`Error reading file: ${error}`);
		}
		return [];
	}

	async checkForTypeTag(filePath: string, type: TagType): Promise<boolean> {
		const tags = await this.getTags(filePath);
		if (tags.length === 0) {
			return false;
		}

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

		new Setting(containerEl)
			.setName("Force Reading View Tags")
			.setDesc(
				"Enter the tags to set the files you want to force to view in reading view, separated by commas. (EX: MOC, HOC)"
			)
			.addText((text) =>
				text
					.setPlaceholder(
						DEFAULT_SETTINGS.forceReadingViewTags.join(", ")
					)
					.setValue(
						String(
							this.plugin.settings.forceReadingViewTags.join(", ")
						)
					)
					.onChange(async (value) => {
						this.plugin.settings.forceReadingViewTags = value
							.split(",")
							.map((tag) => tag.replace("#", "").trim());
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("DebounceTimeout")
			.setDesc(
				"Set the debounce timeout for the active leaf change event. (0 for no debounce)"
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.debounceTimeout.toString())
					.setValue(String(this.plugin.settings.debounceTimeout))
					.onChange(async (value) => {
						this.plugin.settings.debounceTimeout = parseInt(value);
						await this.plugin.saveSettings();
					})
			);
	}
}
