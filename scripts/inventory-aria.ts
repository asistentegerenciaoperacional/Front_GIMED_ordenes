import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const families:Record<string,string>={
 Action:'Button / ToggleButton',Button:'Button',CancelButton:'Button con descarte',LinkButton:'Link',RowLink:'Link',ControlLink:'Link',ControlForm:'Form',ControlLabel:'Label',ControlError:'FieldError',Field:'Label / FieldError',
 ControlInput:'TextField / SearchField / NumberField',ControlTextArea:'TextField / TextArea',ControlSelect:'Select',ProductPicker:'ComboBox por ID',SuggestionList:'Sugerencias ComboBox con texto libre',DateInput:'TextField / Popover / Calendar',
 Dialog:'ModalOverlay / Modal / Dialog',ConfirmationDialog:'Dialog de confirmación',TooltipHelp:'Tooltip',CheckChoice:'Checkbox',ChoiceGroup:'CheckboxGroup',ColumnHeader:'Column / Popover',
 Tabs:'Tabs / TabList / Tab / TabPanel',TabGroup:'Tabs',TabHeader:'TabList / Tab',TabContent:'TabPanel',
 DataTable:'Table',TableHead:'TableHeader',TableRows:'TableBody',TableColumn:'Column',TableRow:'Row',TableCell:'Cell',OrderLineCard:'Disclosure',CardDisclosureAction:'Button de Disclosure',NavigationDrawer:'ModalOverlay / Modal / Dialog',
};
const points:{file:string;line:number;component:string;substitute:string}[]=[];
for(const file of (await readdir('src')).filter(file=>file.endsWith('.tsx'))){
 const source=await readFile('src/'+file,'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=(node:ts.Node)=>{
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const component=node.tagName.getText(tree);
   if(families[component])points.push({file:'src/'+file,line:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,component,substitute:families[component]});
  }
  ts.forEachChild(node,visit);
 };visit(tree);
}
await mkdir('tests/evidence/aria',{recursive:true});
await writeFile('tests/evidence/aria/inventory.json',JSON.stringify({generated:new Date().toISOString(),points:points.length,files:[...new Set(points.map(p=>p.file))],inventory:points},null,2)+'\n');
console.log(points.length+' puntos de uso inventariados');
