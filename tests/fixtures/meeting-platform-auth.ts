import type {AppAccess} from '../../app/app-auth';
let value:AppAccess|null=null;
export function setTestAccess(email:string|null,status='active'){value=email?{user:{userId:'test-'+email,email,displayName:'Fixture',fullName:null},membership:{status:status as AppAccess['membership']['status'],source:'direct_contract',currentPeriodEnd:'',organizationId:'',canUseApp:status==='active'}}:null;}
export async function getAppAccess(){return value;}
