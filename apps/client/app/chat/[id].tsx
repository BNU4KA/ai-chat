import {useLocalSearchParams} from 'expo-router';
import {ChatWorkspace} from '../../src/chat';
export default function Chat(){const {id}=useLocalSearchParams<{id:string}>();return <ChatWorkspace key={id} id={id}/>;}
