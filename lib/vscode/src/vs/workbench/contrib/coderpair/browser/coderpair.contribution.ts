import { URI } from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import {Range} from 'vs/editor/common/core/range';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEditorService, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { localize } from 'vs/nls';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { Gesture } from 'vs/base/browser/touch';
import { Disposable } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType} from 'vs/base/browser/dom';
//import { IBulkEditService} from 'vs/editor/browser/services/bulkEditService';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { mergeSort } from 'vs/base/common/arrays';
//import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';

declare var wb_monaco: any;

const TOGGLE_CODERPAIR_DIALOG = 'coderpair.toggledialog';
const PANEL_HEIGHT = 208;
const SCROLL_HEIGHT = 52;


export class Coderpair extends Disposable{
	 
	private dialogIsVisible:boolean = false
	private statusBarItem: IStatusbarEntryAccessor | undefined
	private userScrollbar: ScrollableElement | undefined

	constructor(
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		//@IConfigurationService private readonly configurationService: IConfigurationService,

		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IFileService private readonly fileService: IFileService,

		//@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super()

		// Listener to connect Firepad

		this.editorService.onDidVisibleEditorsChange(()=>{
			const activeGroup = this.editorGroupService.activeGroup;
			if(activeGroup){
				wb_monaco.setRange(Range);
				wb_monaco.currentGroup = this.editorGroupService.activeGroup.id;
				const control = this.editorService.activeTextEditorControl;
						
				if(isDiffEditor(control)){
					let origEditor = control.getOriginalEditor();
					let modEditor = control.getModifiedEditor();
					let modelL = origEditor.getModel();
					let modelR = modEditor.getModel();
					if(modelL && modelR){
						wb_monaco.connectEditorToFirepad(origEditor, modelL.uri, wb_monaco.currentGroup + 'L') || wb_monaco.connectEditorToFirepad(modEditor, modelR.uri, wb_monaco.currentGroup + 'R')
					}
				}else if(isCodeEditor(control)){
					const model = control.getModel();
					if(model){
						wb_monaco.connectEditorToFirepad(control, model.uri, wb_monaco.currentGroup)
					}
				}
			}
		})

		/*
		this.editorService.onDidActiveEditorChange(()=>{
		})
		*/

		// For Firebase invalidation

		this.fileService.onDidRunOperation(event => {
				switch (event.operation) {
					case FileOperation.CREATE:
						break;
					case FileOperation.DELETE:
						wb_monaco.invalidate(event.resource.path)
						break;
					case FileOperation.MOVE:
						wb_monaco.invalidate(event.resource.path)
						break;
					case FileOperation.COPY:
						break;	
				}
		})
		
		// Get rid of autosave

		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration)
		const configs = configurations.getConfigurations().slice();

		configs.forEach(config => {
			if(config.id == 'files'){
				const props = config.properties;
				if(props){
					delete props['files.autoSave'];
					delete props['files.autoSaveDelay'];
				}
			}
		});
	}

	get name(): string | undefined{
		return this.environmentService.configuration.remoteAuthority
	}

	getURI = () => {
		let uri: URI = URI.parse("");
		let resource: URI = uri.with({scheme:"vscode-remote", authority:'localhost:8080', path:"/Users/robertbeach/projects/code-server/cpr/theme.js", query:"", fragment:""}) 
		return resource;
	}

	// Apply Edits

	private apply(edits:IIdentifiedSingleEditOperation[], model:ITextModel): void {
		if (edits.length > 0) {
			edits = mergeSort(edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			model.pushEditOperations(null, edits, () => null);
		}
		/*
		if (this._newEol !== undefined) {
			this.model.pushEOL(this._newEol);
		}
		*/
	}
	
	
	private apply2(edits:IIdentifiedSingleEditOperation[],editor:ICodeEditor): void {
		if (edits.length > 0) {
			edits = mergeSort(edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			editor.executeEdits('', edits);
		}
		/*
		if (this._newEol !== undefined) {
			if (editor.hasModel()) {
				editor.getModel().pushEOL(this._newEol);
			}
		}
		*/
	}
	
    public executeEdits(edits:IIdentifiedSingleEditOperation[],editor:ICodeEditor,model:ITextModel):void{
		if (editor?.getModel()?.uri.toString() === model.uri.toString()) {
			this.apply2(edits, editor);
		} else {
			this.apply(edits, model);
		}
	}

	/*
	private getResourceEdit(edit: any): ResourceEdit[] {
		const result: ResourceEdit[] = [];
		result.push(new ResourceTextEdit(edit.resource, edit.edit, edit.modelVersionId, edit.metadata));	
		return result;
	}
	
	public async executeEdit(edit: any, options: IComputedEditorOptions): Promise<IBulkEditResult | boolean>{
		//const editTask = new ModelEditTask()
		if (options.get(EditorOption.readOnly)) {
			// read only editor => sorry!
			return Promise.resolve(false);
		}
		const edits = this.getResourceEdit(edit);
		return this._bulkEditService.apply(edits);
	}
	*/

	// Focus in on user location

	public async openURI(path:string, cursor:any):Promise<void> {
		let uri: URI = URI.parse("");
		let resource: URI = uri.with({scheme:"vscode-remote", authority:this.environmentService.configuration.remoteAuthority, path:path, query:"", fragment:""}) 
		let editorPane = await this.editorService.openEditor({ resource: resource, options: { preserveFocus: false, pinned: false } }, ACTIVE_GROUP);
		if(editorPane){
			let control = editorPane.getControl();
			let editor: ICodeEditor | undefined;
			if (isCodeEditor(control)) {
				editor = control as ICodeEditor;
			} else if (isDiffEditor(control)) {
				editor = control.getModifiedEditor();
			}
			if(editor){
				if(!cursor){
					cursor = {l:1,c:1}
				}
				const range:Range = new Range(cursor.l,cursor.c,cursor.l,cursor.c)
				editor.revealRangeInCenter(range)
				wb_monaco.goToRange = {
					editor:editor,
					range:range
				}
			}
		}
	}

	// User dialog box

    public showDialog():void{
		this.dialogIsVisible=true
		let elem = document.getElementById('firepad-userlist');
		if(elem){
			elem.style.visibility='visible';
		}
		this.updateStatusbarEntry()
	}

	public hideDialog():void{
		this.dialogIsVisible=false
		let elem = document.getElementById('firepad-userlist');
		if(elem){
			elem.style.visibility='hidden';
		}
		this.updateStatusbarEntry()
	}

    public updateStatusbarEntry():void{
		// Toggle Notifications Center
		CommandsRegistry.registerCommand(TOGGLE_CODERPAIR_DIALOG, accessor => {
			if (this.dialogIsVisible) {
				this.hideDialog();
			} else {
				this.hideDialog();
				this.showDialog();
			}
		});
		// Show the bell with a dot if there are unread or in-progress notifications
		const statusProperties: IStatusbarEntry = {
			text: '$(organization)',
			ariaLabel: localize('status.notifications', "Live"),
			command: TOGGLE_CODERPAIR_DIALOG,
			tooltip: 'Live',
			showBeak: this.dialogIsVisible
		};

		if (!this.statusBarItem) {
			this.statusBarItem = this.statusbarService.addEntry(
				statusProperties,
				'status.collab',
				localize('status.collab', "Live"),
				StatusbarAlignment.RIGHT,
				-Number.MAX_VALUE /* towards the far end of the right hand side */
			);
		} else {
			this.statusBarItem.update(statusProperties);
		}
	}	

	public makeUserScrollbar(parent:HTMLDivElement,container:HTMLDivElement):ScrollableElement{
		// Container
		const outer = document.createElement('div');
		outer.setAttribute('role', 'tablist');
		this._register(Gesture.addTarget(outer));

		// Scrollbar
		const scrollbar = this._register(this.createUserScrollbar(outer));
		parent.appendChild(scrollbar.getDomNode());
		outer.appendChild(container);
		
		// Container listeners
		this.registerContainerListeners2(outer, scrollbar);
		scrollbar.setScrollDimensions({height: PANEL_HEIGHT,scrollHeight:SCROLL_HEIGHT});
		this.userScrollbar = scrollbar;
		return scrollbar;
	}

	public setUserScrollbarDimensions(n:number):void{
		if(this.userScrollbar)
		this.userScrollbar.setScrollDimensions({height: PANEL_HEIGHT,scrollHeight:SCROLL_HEIGHT*n});
	}

	private createUserScrollbar(scrollable: HTMLElement): ScrollableElement {
		const scrollbar = new ScrollableElement(scrollable, {
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Visible,
			verticalScrollbarSize: 7,
			handleMouseWheel: true,
			useShadows: false
		});

		scrollbar.onScroll(e => {
			scrollable.scrollTop = e.scrollTop;
		});

		return scrollbar;
	}

	private registerContainerListeners2(container: HTMLElement, scrollbar: ScrollableElement): void {

		// Forward scrolling inside the container to our custom scrollbar
		this._register(addDisposableListener(container, EventType.SCROLL, () => {
			if (container.classList.contains('scroll')) {
				scrollbar.setScrollPosition({
					scrollTop: container.scrollTop // during DND the container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));
	}

	public makePathScrollbar(parent:HTMLDivElement,container:HTMLDivElement): ScrollableElement{
		// Container
		const outer = document.createElement('div');
		outer.setAttribute('role', 'tablist');
		this._register(Gesture.addTarget(outer));

		// Scrollbar
		const scrollbar = this._register(this.createPathScrollbar(outer));
		parent.appendChild(scrollbar.getDomNode());
		outer.appendChild(container);
		
		// Container listeners
		this.registerContainerListeners(outer, scrollbar);
		return scrollbar;
	}

	private createPathScrollbar(scrollable: HTMLElement): ScrollableElement {
		const scrollbar = new ScrollableElement(scrollable, {
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: false,
			allowPropagation:true,
			useShadows: false
		});

		scrollbar.onScroll(e => {
			scrollable.scrollLeft = e.scrollLeft;
		});

		return scrollbar;
	}

	private registerContainerListeners(container: HTMLElement, scrollbar: ScrollableElement): void {

		// Forward scrolling inside the container to our custom scrollbar
		this._register(addDisposableListener(container, EventType.SCROLL, () => {
			if (container.classList.contains('scroll')) {
				scrollbar.setScrollPosition({
					scrollLeft: container.scrollLeft // during DND the container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));
	}
}

wb_monaco.initializeCoderpair = function(){
	const instantiationService = new InstantiationService(wb_monaco.serviceCollection, true);
	wb_monaco.coderpair = instantiationService.createInstance(Coderpair);
	wb_monaco.userList.makeUserList()
}


