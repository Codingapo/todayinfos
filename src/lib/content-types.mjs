export const CONTENT_TYPE_DEFINITIONS = {
  news: {
    label:'News',icon:'📰',description:'News, announcements and time-sensitive updates.',
    fields:[
      {key:'event_date',label:'News / event date',type:'date',help:'Optional. Keep this separate from the published/posted date.'}
    ]
  },
  bursary: {
    label:'Bursary',icon:'🎓',description:'Funding opportunities with dates, eligibility and application instructions.',
    fields:[
      {key:'provider',label:'Provider / organisation',type:'text',required:true},
      {key:'opening_date',label:'Opening date',type:'date'},
      {key:'closing_date',label:'Closing date',type:'date'},
      {key:'status_override',label:'Bursary status',type:'select',options:['auto','open','closing_soon','closed','upcoming','unknown'],help:'Auto calculates from stored dates. Override only when necessary.'},
      {key:'requirements',label:'Requirements',type:'textarea'},
      {key:'eligibility',label:'Who is eligible?',type:'textarea'},
      {key:'how_to_apply',label:'How to apply',type:'textarea'},
      {key:'application_url',label:'Official application link',type:'url'}
    ]
  },
  scholarship: {
    label:'Scholarship',icon:'🌍',description:'Scholarships and education funding opportunities.',inherits:'bursary'
  },
  job: {
    label:'Job',icon:'💼',description:'Vacancies with employer, location, requirements and application details.',
    fields:[
      {key:'company',label:'Company / organisation',type:'text',required:true},
      {key:'location',label:'Location',type:'text'},
      {key:'salary',label:'Salary',type:'text'},
      {key:'closing_date',label:'Closing date',type:'date'},
      {key:'status_override',label:'Opportunity status',type:'select',options:['auto','open','closing_soon','closed','upcoming','unknown'],help:'Auto calculates from the closing date. Override only when necessary.'},
      {key:'requirements',label:'Requirements',type:'textarea'},
      {key:'responsibilities',label:'Responsibilities',type:'textarea'},
      {key:'how_to_apply',label:'How to apply',type:'textarea'},
      {key:'application_url',label:'Application link',type:'url'}
    ]
  },
  internship: {
    label:'Internship',icon:'🧭',description:'Internship opportunities.',inherits:'job'
  },
  learnership: {
    label:'Learnership',icon:'🛠️',description:'Learnership and apprenticeship opportunities.',inherits:'job'
  },
  announcement: {
    label:'Announcement',icon:'📣',description:'Official announcements and notices.',inherits:'news'
  },
  story: {
    label:'Story',icon:'✍️',description:'Long-form stories and useful editorial content.',fields:[]
  },
  opportunity: {
    label:'Opportunity',icon:'✨',description:'General structured opportunities for global discovery.',fields:[
      {key:'closing_date',label:'Closing date',type:'date'},
      {key:'status_override',label:'Opportunity status',type:'select',options:['auto','open','closing_soon','closed','upcoming','unknown']},
      {key:'requirements',label:'Requirements',type:'textarea'},
      {key:'how_to_apply',label:'How to apply',type:'textarea'},
      {key:'application_url',label:'Application link',type:'url'}
    ]
  },
  other: {
    label:'Other supported content',icon:'◫',description:'Flexible structured content for future page types.',fields:[{key:'subtype',label:'Content subtype',type:'text',help:'Example: guide, notice, resource or update.'}]
  }
};

export function resolvedDefinition(type){
  const def=CONTENT_TYPE_DEFINITIONS[type]||CONTENT_TYPE_DEFINITIONS.other;
  if(def.inherits){const parent=CONTENT_TYPE_DEFINITIONS[def.inherits];return{...parent,...def,fields:parent.fields||[]}}
  return def;
}
